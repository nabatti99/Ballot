import { network } from "hardhat";

const { ethers } = require("hardhat");

export const blockTimestamp = async () => {
  return (await ethers.provider.getBlock()).timestamp;
};

export const skipTime = async (seconds: number) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

export const setTime = async (time: number) => {
  await network.provider.send("evm_setNextBlockTimestamp", [time]);
  await network.provider.send("evm_mine");
};

export const skipBlock = async (blockNumber: number) => {
  for (let index = 0; index < blockNumber; index++) {
    await ethers.provider.send("evm_mine");
  }
};

export const getCurrentBlock = async () => {
  const latestBlock = await ethers.provider.getBlock("latest");
  return latestBlock.number;
};
