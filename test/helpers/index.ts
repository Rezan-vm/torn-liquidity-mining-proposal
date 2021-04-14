// @ts-ignore
import hre, { ethers } from "hardhat";

/**
 *  Takes a snapshot and returns the ID of the snapshot for restoring later.
 * @returns {string} id
 */
export async function takeSnapshot() {
  return await ethers.provider.send("evm_snapshot", []);
}

/**
 *  Restores a snapshot that was previously taken with takeSnapshot
 *  @param {string} id The ID that was returned when takeSnapshot was called.
 */
export async function restoreSnapshot(id: string) {
  await ethers.provider.send("evm_revert", [id]);
}

export const advanceTime = async (sec: number) => {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  await ethers.provider.send("evm_setNextBlockTimestamp", [now + sec]);
};

export const setTime = async (timestamp: number) => {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
};

export const getSignerFromAddress = async (address: string) => {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });

  return await ethers.provider.getSigner(address);
};
