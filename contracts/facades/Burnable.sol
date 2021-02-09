// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

abstract contract Burnable {
    function burn (uint amount) public virtual;
    function symbol() public virtual pure returns (string memory);
    function burn (address holder, uint amount) public virtual;
}