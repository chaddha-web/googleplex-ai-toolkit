// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/ICIDRegistry.sol";

contract CIDRegistry is ICIDRegistry {
    mapping(bytes32 => string) private siteCIDs;
    mapping(bytes32 => address) public siteOwners;

    function register(bytes32 siteId, string memory cid) external override {
        if (siteOwners[siteId] == address(0)) {
            siteOwners[siteId] = msg.sender;
        } else {
            require(msg.sender == siteOwners[siteId], "Only owner can update CID");
        }

        siteCIDs[siteId] = cid;
        emit CIDUpdated(siteId, cid);
    }

    function cidOf(bytes32 siteId) external view override returns (string memory) {
        return siteCIDs[siteId];
    }
}
