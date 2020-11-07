// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

abstract contract BehodlerLike {
  
    function setValidToken(
        address token,
        bool valid,
        bool burnable
    ) public virtual;
}