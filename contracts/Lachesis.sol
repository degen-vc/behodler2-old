// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
import "./openzeppelin/Ownable.sol";
import "./facades/LachesisLike.sol";

contract Lachesis is Ownable, LachesisLike {
    struct tokenConfig {
        bool valid;
        bool burnable;
    }
    mapping(address => tokenConfig) private config;

    function cut(address token) public override view returns (bool, bool) {
        tokenConfig memory parameters = config[token];
        return (parameters.valid, parameters.burnable);
    }

    function measure(
        address token,
        bool valid,
        bool burnable
    ) public override onlyOwner {
        config[token] = tokenConfig({valid: valid, burnable: burnable});
    }
}
