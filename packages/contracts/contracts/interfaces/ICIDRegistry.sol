// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICIDRegistry {
    event CIDUpdated(bytes32 indexed siteId, string cid);

    function register(bytes32 siteId, string memory cid) external;
    function cidOf(bytes32 siteId) external view returns (string memory);
}
