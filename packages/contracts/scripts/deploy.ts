import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy Escrow
  const Escrow = await ethers.getContractFactory("Escrow");
  // Assuming deployer is the daoApprover for now
  const escrow = await Escrow.deploy(deployer.address);
  await escrow.waitForDeployment();
  console.log("Escrow deployed to:", await escrow.getAddress());

  // Deploy CIDRegistry
  const CIDRegistry = await ethers.getContractFactory("CIDRegistry");
  const cidRegistry = await CIDRegistry.deploy();
  await cidRegistry.waitForDeployment();
  console.log("CIDRegistry deployed to:", await cidRegistry.getAddress());
  
  // Save the addresses
  console.log("\nDeployment complete.");
  console.log(`
export const DEPLOYED_ADDRESSES = {
    escrow: "${await escrow.getAddress()}",
    cidRegistry: "${await cidRegistry.getAddress()}"
};
  `);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
