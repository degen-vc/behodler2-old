// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

abstract contract LachesisLike {
    function cut(address token) public virtual view returns (bool, bool);

    function measure(
        address token,
        bool valid,
        bool burnable
    ) public virtual;
}
