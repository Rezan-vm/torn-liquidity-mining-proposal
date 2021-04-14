// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./StakingRewards.sol";

interface Vesting {
  function release() external;
  function vestedAmount() external view returns (uint256);
}

contract LiquidityMiningProposal {
  address public constant UNI_ETH_TORN_LP = address(0x0C722a487876989Af8a05FFfB6e32e45cc23FB3A);
  uint public constant UNI_REWARDS_AMOUNT = 120000 ether;
  IERC20 public constant TORN = IERC20(0x77777FeDdddFfC19Ff86DB637967013e6C6A116C);
  Vesting public constant govVesting = Vesting(0x179f48C78f57A3A78f0608cC9197B8972921d1D2);

  event DeploymentOf(string name, address addr);

  function executeProposal() external {
    if(govVesting.vestedAmount() > 0) {
      govVesting.release();
    }

    StakingRewards rewardsPool = new StakingRewards(address(TORN), UNI_ETH_TORN_LP);
    emit DeploymentOf("Staking pool of UNI ETH/TORN LP", address(rewardsPool));

    TORN.transfer(address(rewardsPool), UNI_REWARDS_AMOUNT);
    rewardsPool.notifyRewardAmount(UNI_REWARDS_AMOUNT);
  }
}
