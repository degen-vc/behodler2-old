// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

abstract contract BehodlerLike {
    function addLiquidity(address it, uint256 ia)
        public
        virtual
        returns (uint256);

    function withdrawLiquidity(address ot, uint256 oa)
        public
        virtual
        returns (uint256);

    function setValidToken(
        address token,
        bool valid,
        bool burnable
    ) public virtual;
}
