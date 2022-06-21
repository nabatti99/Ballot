import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, ContractFactory } from "ethers";

const fs = require("fs");
const { ethers, upgrades, network } = require("hardhat");

async function main() {
  // Loading accounts
  const accounts: SignerWithAddress[] = await ethers.getSigners();
  const addresses: string[] = accounts.map(
    (item: SignerWithAddress) => item.address
  );
  const deployer: string = addresses[0];

  console.log(`===DEPLOY CONTRACT TO: ${network.name}===`);

  // We get the contract to deploy
  const Ballot: ContractFactory = await ethers.getContractFactory("Ballot");
  const ballot: Contract = await Ballot.deploy();

  await ballot.deployed();

  console.log("Ballot deployed to:", ballot.address);

  // export deployed contracts to json
  const verifyArguments = {
    Ballot: {
      address: ballot.address,
      constructorArguments: [],
    },
  };

  fs.writeFileSync("verifyArguments.json", JSON.stringify(verifyArguments));
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
