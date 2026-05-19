// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrow {
    event Funded(uint256 indexed milestoneId, address indexed funder, uint256 amount);
    event Released(uint256 indexed milestoneId, address indexed freelancer, uint256 amount);
    event Refunded(uint256 indexed milestoneId, address indexed funder, uint256 amount);

    function fund(uint256 milestoneId) external payable;
    function approveAndRelease(uint256 milestoneId, address freelancer) external;
    function refund(uint256 milestoneId) external;
}
