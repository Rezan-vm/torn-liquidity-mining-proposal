import hre from 'hardhat'

async function main() {
  const LiquidityPool = await hre.ethers.getContractFactory("LiquidityPool");
  const liquidityPool = await LiquidityPool.deploy();

  await liquidityPool.deployed();

  console.log("Liquidity pool deployed to:", liquidityPool.address);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
