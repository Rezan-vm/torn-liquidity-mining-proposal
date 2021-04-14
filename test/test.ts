import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getSignerFromAddress,
  advanceTime,
  setTime,
  takeSnapshot,
  restoreSnapshot,
} from "./helpers";
import governanceAbi from "../abi/governance.json";
import uniPoolAbi from "../abi/uniPool.json";
import uniRouterAbi from "../abi/uniRouter.json";
import Torn from "../artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json";
import StakingRewards from "../artifacts/contracts/StakingRewards.sol/StakingRewards.json";

const DAY = 60 * 60 * 24;

describe("LiquidityMiningProposal", function () {
  // Live TORN contract
  const tornToken = "0x77777FeDdddFfC19Ff86DB637967013e6C6A116C";
  // Live governance contract
  const governanceAddress = "0x5efda50f22d34F262c29268506C5Fa42cB56A1Ce";
  // TORN whale to vote with 25k votes
  const tornWhale = "0x5f48c2a71b2cc96e3f0ccae4e39318ff0dc375b2";
  const stakerAddress = "0xa2b2fbcac668d86265c45f62da80aaf3fd1dede3";

  const torn25k = ethers.utils.parseEther("25000");
  let proposal: Contract;
  let uniPool: Contract;
  let uniRouter: Contract;
  let torn: Contract;
  let stakingPool: Contract;
  let staker: any;
  let snapshotId: string;
  let accounts: any[];

  before(async () => {
    accounts = await ethers.getSigners();
    staker = await getSignerFromAddress(stakerAddress);
    const Proposal = await ethers.getContractFactory("LiquidityMiningProposal");
    proposal = await Proposal.deploy();

    await proposal.deployed();
    // Get Tornado governance contract
    let governance = await ethers.getContractAt(
      governanceAbi,
      governanceAddress
    );
    uniPool = await ethers.getContractAt(
      uniPoolAbi,
      "0x0C722a487876989Af8a05FFfB6e32e45cc23FB3A"
    );
    uniRouter = await ethers.getContractAt(
      uniRouterAbi,
      "0x7a250d5630b4cf539739df2c5dacb4c659f2488d"
    );
    uniRouter = uniRouter.connect(staker);

    // Get TORN token contract
    torn = await ethers.getContractAt(Torn.abi, tornToken);

    // Impersonate a TORN address with more than 25k tokens
    const tornWhaleSigner = await getSignerFromAddress(tornWhale);
    torn = torn.connect(tornWhaleSigner);
    governance = governance.connect(tornWhaleSigner);

    // Lock 25k TORN in governance
    await torn.approve(governance.address, torn25k);
    await governance.lockWithApproval(torn25k);

    // Propose
    await governance.propose(proposal.address, "Enable anonymity mining");
    const proposalId = await governance.proposalCount();

    // Wait the voting delay and vote for the proposal
    await advanceTime((await governance.VOTING_DELAY()).toNumber() + 1);
    await governance.castVote(proposalId, true);

    // Wait voting period + execution delay
    await advanceTime(
      (await governance.VOTING_PERIOD()).toNumber() +
        (await governance.EXECUTION_DELAY()).toNumber()
    );

    // Execute the proposal
    const receipt = await governance.execute(proposalId);
    const { events, gasUsed } = await receipt.wait();
    const [stakingPoolAddress] = events
      .filter(
        (e: any) =>
          e.topics[0] ===
          "0x06633ee22fe8e793dec66ce36696e948bb0cc0d018ab361e8dfeb34151a4d466"
      )
      .map((e: any) => "0x" + e.data.slice(90, 130));
    stakingPool = await ethers.getContractAt(
      StakingRewards.abi,
      stakingPoolAddress
    );
    stakingPool = stakingPool.connect(staker);

    torn = torn.connect(staker);
    await torn.approve(
      uniRouter.address,
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    uniPool = uniPool.connect(staker);
    await uniPool.approve(
      stakingPool.address,
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    snapshotId = await takeSnapshot();
  });

  it("Should earn rewards", async function () {
    await uniRouter.addLiquidityETH(
      torn.address,
      "1736200000000000000000",
      1,
      1,
      staker._address,
      1638051083,
      {
        value: "100000000000000000000",
      }
    );

    const LPBalance = await uniPool.balanceOf(staker._address);

    await stakingPool.stake(LPBalance);
    await advanceTime(DAY * 30);

    const tornBalanceBefore = await torn.balanceOf(staker._address);
    await stakingPool.getReward();
    const tornBalanceAfter = await torn.balanceOf(staker._address);
    expect(tornBalanceAfter.sub(tornBalanceBefore)).to.be.gt(0);
  });

  it("#updatePeriodFinish decrease", async () => {
    const oldPeriodFinish = await stakingPool.periodFinish();
    const staker1 = accounts[0];
    await uniRouter.addLiquidityETH(
      torn.address,
      "1736200000000000000000",
      1,
      1,
      staker._address,
      1638051083,
      {
        value: "100000000000000000000",
      }
    );
    const LPBalance = await uniPool.balanceOf(staker._address);
    await uniPool.transfer(staker1.address, 10);

    await stakingPool.stake(LPBalance.sub(10));
    await setTime(oldPeriodFinish.sub(DAY * 30 * 3).toNumber());

    uniPool = uniPool.connect(staker1);
    await uniPool.approve(
      stakingPool.address,
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );
    stakingPool = stakingPool.connect(staker1);
    await stakingPool.stake(1);

    // let earned = await stakingPool.earned(staker._address);

    const gov = await getSignerFromAddress(governanceAddress);
    stakingPool = stakingPool.connect(gov);
    const newPeriodFinish = oldPeriodFinish.sub(DAY * 30);
    await stakingPool.updatePeriodFinish(newPeriodFinish);
    await setTime(newPeriodFinish.toNumber() + DAY);

    stakingPool = stakingPool.connect(staker);
    const tornBalanceBefore = await torn.balanceOf(staker._address);
    await stakingPool.getReward();
    const tornBalanceAfter = await torn.balanceOf(staker._address);
    expect(tornBalanceAfter.sub(tornBalanceBefore)).to.be.gt(0);
  });

  it("#constructor", async () => {
    const ownerFromContract = await stakingPool.owner();
    expect(ownerFromContract).to.be.equal(governanceAddress);
  });

  afterEach(async () => {
    await restoreSnapshot(snapshotId);
    snapshotId = await takeSnapshot();
  });
});
