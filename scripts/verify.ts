const hardhat = require("hardhat");
const { Ballot } = require("../verifyArguments.json");

async function main() {
  try {
    await hardhat.run("verify:verify", {
      address: Ballot.address,
      constructorArguments: Ballot.constructorArguments,
    });
  } catch (err) {
    console.error(err);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
