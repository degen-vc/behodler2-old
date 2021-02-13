// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

contract MockSwapFactory {
    mapping(address => mapping(address => address)) public getPair;

    function addPair(
        address token1,
        address token2,
        address lpToken
    ) public {
        getPair[token1][token2] = lpToken;
        getPair[token2][token1] = lpToken;
    }
}
