// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IEscrow.sol";

contract Escrow is IEscrow {
    enum Status { Unfunded, Funded, Released, Refunded }

    struct Milestone {
        address funder;
        uint256 amount;
        Status status;
    }

    mapping(uint256 => Milestone) public milestones;
    address public daoApprover;

    event DaoApproverChanged(address indexed oldApprover, address indexed newApprover);

    constructor(address _daoApprover) {
        daoApprover = _daoApprover;
    }

    function setDaoApprover(address _newApprover) external {
        require(msg.sender == daoApprover, "Only daoApprover can change");
        emit DaoApproverChanged(daoApprover, _newApprover);
        daoApprover = _newApprover;
    }

    function fund(uint256 milestoneId) external payable override {
        require(msg.value > 0, "Must fund with greater than 0");
        require(milestones[milestoneId].status == Status.Unfunded, "Milestone already funded");

        milestones[milestoneId] = Milestone({
            funder: msg.sender,
            amount: msg.value,
            status: Status.Funded
        });

        emit Funded(milestoneId, msg.sender, msg.value);
    }

    function approveAndRelease(uint256 milestoneId, address freelancer) external override {
        Milestone storage milestone = milestones[milestoneId];
        require(msg.sender == milestone.funder, "Only funder can release");
        require(milestone.status == Status.Funded, "Milestone not funded or already finalized");

        milestone.status = Status.Released;
        uint256 amountToRelease = milestone.amount;
        
        (bool success, ) = freelancer.call{value: amountToRelease}("");
        require(success, "Transfer failed");

        emit Released(milestoneId, freelancer, amountToRelease);
    }

    function approveByDao(uint256 milestoneId, address freelancer) external {
        require(msg.sender == daoApprover, "Only daoApprover can release");
        Milestone storage milestone = milestones[milestoneId];
        require(milestone.status == Status.Funded, "Milestone not funded or already finalized");

        milestone.status = Status.Released;
        uint256 amountToRelease = milestone.amount;
        
        (bool success, ) = freelancer.call{value: amountToRelease}("");
        require(success, "Transfer failed");

        emit Released(milestoneId, freelancer, amountToRelease);
    }

    function refund(uint256 milestoneId) external override {
        Milestone storage milestone = milestones[milestoneId];
        require(msg.sender == milestone.funder, "Only funder can refund");
        require(milestone.status == Status.Funded, "Milestone not funded or already finalized");

        milestone.status = Status.Refunded;
        uint256 amountToRefund = milestone.amount;

        (bool success, ) = msg.sender.call{value: amountToRefund}("");
        require(success, "Transfer failed");

        emit Refunded(milestoneId, msg.sender, amountToRefund);
    }
}
