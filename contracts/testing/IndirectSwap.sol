pragma solidity ^0.7.1;

abstract contract BehodlerLike {
    function addLiquidity(address it, uint ia) public virtual returns (uint);
    function withdrawLiquidity(address ot, uint oa) public virtual returns (uint);
}

abstract contract ERC20{
    function transferFrom (address sender, address receiver, uint amount) external virtual returns (bool);
    function transfer (address receiver, uint amount) external virtual returns (bool);
    function approve(address spender, uint amount) external virtual;
}

contract IndirectSwap {
    BehodlerLike behodler;

    constructor (address _behodler) {
        behodler = BehodlerLike(_behodler);
    }

    function swap(address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    ) public returns (bool success) {
        ERC20(inputToken).transferFrom(msg.sender,address(this),inputAmount);
        ERC20(inputToken).approve(address(behodler),inputAmount);
        uint scx = behodler.addLiquidity(inputToken, inputAmount);
        uint scxUsed = behodler.withdrawLiquidity(outputToken, outputAmount);
        if(scx>scxUsed){
            uint difference = scx-scxUsed;
            require((difference*1000)/scx==0);
        }
        require(scx==scxUsed,"TEST: scx usage mismatch");
       ERC20(outputToken).transfer(msg.sender,outputAmount);
    } 
}