import { expect } from "chai";
import { ethers } from "hardhat";

describe("Escrow", function () {
  async function deployEscrowFixture() {
    const [owner, funder, freelancer, stranger, daoApprover] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = await Escrow.deploy(daoApprover.address);
    return { escrow, owner, funder, freelancer, stranger, daoApprover };
  }

  it("Should fund a milestone", async function () {
    const { escrow, funder } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await expect(escrow.connect(funder).fund(milestoneId, { value: fundAmount }))
      .to.emit(escrow, "Funded")
      .withArgs(milestoneId, funder.address, fundAmount);

    const milestone = await escrow.milestones(milestoneId);
    expect(milestone.funder).to.equal(funder.address);
    expect(milestone.amount).to.equal(fundAmount);
    expect(milestone.status).to.equal(1n); // 1 = Status.Funded
  });

  it("Should release funds to a freelancer", async function () {
    const { escrow, funder, freelancer } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    const initialFreelancerBalance = await ethers.provider.getBalance(freelancer.address);

    await expect(escrow.connect(funder).approveAndRelease(milestoneId, freelancer.address))
      .to.emit(escrow, "Released")
      .withArgs(milestoneId, freelancer.address, fundAmount);

    const finalFreelancerBalance = await ethers.provider.getBalance(freelancer.address);
    expect(finalFreelancerBalance - initialFreelancerBalance).to.equal(fundAmount);

    const milestone = await escrow.milestones(milestoneId);
    expect(milestone.status).to.equal(2n); // 2 = Status.Released
  });

  it("Should release funds via DAO approver", async function () {
    const { escrow, funder, freelancer, daoApprover } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    const initialFreelancerBalance = await ethers.provider.getBalance(freelancer.address);

    await expect(escrow.connect(daoApprover).approveByDao(milestoneId, freelancer.address))
      .to.emit(escrow, "Released")
      .withArgs(milestoneId, freelancer.address, fundAmount);

    const finalFreelancerBalance = await ethers.provider.getBalance(freelancer.address);
    expect(finalFreelancerBalance - initialFreelancerBalance).to.equal(fundAmount);

    const milestone = await escrow.milestones(milestoneId);
    expect(milestone.status).to.equal(2n); // 2 = Status.Released
  });

  it("Should revert if non-DAO approver calls approveByDao", async function () {
    const { escrow, funder, stranger, freelancer } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    await expect(
        escrow.connect(stranger).approveByDao(milestoneId, freelancer.address)
    ).to.be.revertedWith("Only daoApprover can release");
  });

  it("Should refund the funder", async function () {
    const { escrow, funder } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    await expect(escrow.connect(funder).refund(milestoneId))
      .to.emit(escrow, "Refunded")
      .withArgs(milestoneId, funder.address, fundAmount);

    const milestone = await escrow.milestones(milestoneId);
    expect(milestone.status).to.equal(3n); // 3 = Status.Refunded
  });

  it("Should prevent double funding", async function () {
    const { escrow, funder } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    await expect(
        escrow.connect(funder).fund(milestoneId, { value: fundAmount })
    ).to.be.revertedWith("Milestone already funded");
  });

  it("Should revert if non-funder tries to release", async function () {
    const { escrow, funder, stranger, freelancer } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });

    await expect(
        escrow.connect(stranger).approveAndRelease(milestoneId, freelancer.address)
    ).to.be.revertedWith("Only funder can release");
  });

  it("Should revert if trying to refund after release", async function () {
    const { escrow, funder, freelancer } = await deployEscrowFixture();
    const milestoneId = 1;
    const fundAmount = ethers.parseEther("1.0");

    await escrow.connect(funder).fund(milestoneId, { value: fundAmount });
    await escrow.connect(funder).approveAndRelease(milestoneId, freelancer.address);

    await expect(
        escrow.connect(funder).refund(milestoneId)
    ).to.be.revertedWith("Milestone not funded or already finalized");
  });

  it("Should allow daoApprover to update the approver", async function () {
    const { escrow, daoApprover, stranger } = await deployEscrowFixture();

    await expect(escrow.connect(daoApprover).setDaoApprover(stranger.address))
      .to.emit(escrow, "DaoApproverChanged")
      .withArgs(daoApprover.address, stranger.address);

    expect(await escrow.daoApprover()).to.equal(stranger.address);
  });

  it("Should revert if non-approver tries to update the approver", async function () {
    const { escrow, stranger } = await deployEscrowFixture();

    await expect(
        escrow.connect(stranger).setDaoApprover(stranger.address)
    ).to.be.revertedWith("Only daoApprover can change");
  });
});
