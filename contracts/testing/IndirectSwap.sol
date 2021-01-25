pragma solidity ^0.7.1;
import "../facades/BehodlerLike.sol";

abstract contract ERC20 {
    function transferFrom(
        address sender,
        address receiver,
        uint256 amount
    ) external virtual returns (bool);

    function transfer(address receiver, uint256 amount)
        external
        virtual
        returns (bool);

    function approve(address spender, uint256 amount) external virtual;
}

contract IndirectSwap {
    BehodlerLike behodler;

    constructor(address _behodler) {
        behodler = BehodlerLike(_behodler);
    }

    function swap(
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    ) public returns (bool success) {
        ERC20(inputToken).transferFrom(msg.sender, address(this), inputAmount);
        ERC20(inputToken).approve(address(behodler), inputAmount);
        uint256 scx = behodler.addLiquidity(inputToken, inputAmount);
        uint256 scxUsed = behodler.withdrawLiquidity(outputToken, outputAmount);
        if (scx > scxUsed) {
            uint256 difference = scx - scxUsed;
            require((difference * 1000) / scx == 0);
        }
        require(scx == scxUsed, "TEST: scx usage mismatch");
        ERC20(outputToken).transfer(msg.sender, outputAmount);
        return success;
    }
}
