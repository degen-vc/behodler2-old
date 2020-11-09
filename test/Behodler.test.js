const { accounts, contract } = require('@openzeppelin/test-environment');
const { expectEvent, expectRevert, ether } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');
const { BNtoBigInt } = require('./helpers/BigIntUtil');
const bigNum = require('./helpers/BigIntUtil')

const Behodler = contract.fromArtifact('Behodler');
const AddressBalanceCheck = contract.fromArtifact('AddressBalanceCheck');
const CommonMath = contract.fromArtifact('CommonMath');
const MockToken1 = contract.fromArtifact('MockToken1')
const MockWeth = contract.fromArtifact('MockWeth')
const OpenArbiter = contract.fromArtifact('OpenArbiter')
const Lachesis = contract.fromArtifact('Lachesis')

const TEN = 10000000000000000000n
const ONE = 1000000000000000000n
const FINNEY = 1000000000000000n


describe('Behodler', async function () {
    const [owner, trader1, trader2, feeDestination] = accounts;

    beforeEach(async function () {
        const addressBalanceCheckLib = await AddressBalanceCheck.new()
        const commonMathLib = await CommonMath.new()
        await Behodler.detectNetwork()
        await Behodler.link('AddressBalanceCheck', addressBalanceCheckLib.address)
        await Behodler.link('CommonMath', commonMathLib.address)
        this.behodler = await Behodler.new({ from: owner });

        this.weth = await MockWeth.new({ from: owner })
        this.regularToken = await MockToken1.new({ from: owner })
        this.burnableToken = await MockToken1.new({ from: owner })
        this.invalidToken = await MockToken1.new({ from: owner })
        this.flashLoanArbiter = await OpenArbiter.new({ from: owner })
        this.lachesis = await Lachesis.new({ from: owner })
        await this.regularToken.mint(trader1, 2n * TEN)
        await this.burnableToken.mint(trader1, 2n * TEN)
        await this.invalidToken.mint(trader1, TEN)

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, { from: owner })
        await this.behodler.configureScarcity(110, 25, feeDestination, { from: owner })
        await this.lachesis.measure(this.regularToken.address, true, false, { from: owner })
        await this.lachesis.measure(this.burnableToken.address, true, true, { from: owner })

        await this.lachesis.setBehodler(this.behodler.address, { from: owner })
        await this.lachesis.updateBehodler(this.regularToken.address, { from: owner })
        await this.lachesis.updateBehodler(this.burnableToken.address, { from: owner })
    })

    // it('adding burnable token as liquidity in 2 batches generates the correct volume of Scarcity', async function () {
    //     //ADD 1 FINNEY WHEN BEHODLER BALANCE OF TOKEN ZERO
    //     const originalBalance = TEN
    //     const expectedBalanceAfter = originalBalance - FINNEY

    //     const scarcitySupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
    //     expect(scarcitySupplyBefore).to.equal(0n)

    //     await this.burnableToken.approve(this.behodler.address, originalBalance, { from: trader1 })
    //     await this.behodler.addLiquidity(this.burnableToken.address, FINNEY, 0, 31622776, 31224989, { from: trader1 })

    //     const tokenBalanceOfUser = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
    //     expect(tokenBalanceOfUser).to.equal(expectedBalanceAfter)
    //     const scarcityBalance = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

    //     // (9.75x10¹⁴)x4294967296 = 134110306572959744
    //     const expectedScarcity = 134110306572959744n
    //     expect(scarcityBalance).to.equal(expectedScarcity)

    //     const scarcitySupplyAfter = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
    //     expect(scarcitySupplyAfter).to.equal(expectedScarcity)

    //     //ADD 20 FINNEY WHEN BEHODLER BALANCE IS 1 FINNEY
    //     //EXPECTED SCARCITY: (ROOT(21 FINNEY)-ROOT(1 FINNEY))*2^32 ≈ 4.865811007×10¹⁷

    //     await this.behodler.addLiquidity(this.burnableToken.address, 21n * FINNEY, 31224989, 148323969, 146458185, { from: trader1 })
    //     //21450000000000000
    //     const expectedBalanceAfterSecondAdd = expectedBalanceAfter - 21n * FINNEY
    //     const tokenBalanceOfUserAfterSecondAdd = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
    //     expect(tokenBalanceOfUserAfterSecondAdd).to.equal(expectedBalanceAfterSecondAdd)

    //     const scarcityBalanceAfterSecondAdd = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

    //     const expectedScarcityAfterSecondAdd = 629033114806517760n
    //     assert.isTrue(scarcityBalanceAfterSecondAdd === expectedScarcityAfterSecondAdd, `${expectedScarcityAfterSecondAdd}; ${scarcityBalanceAfterSecondAdd}`)
    // })

    it('add liquidity as burnable token in 1 batch generates correct amount of Scarcity', async function () {
        await this.burnableToken.approve(this.behodler.address, 22n * FINNEY, { from: trader1 })
        await this.behodler.addLiquidity(this.burnableToken.address, 22n * FINNEY, 0, 148323969, 146458185, { from: trader1 })

        const scarcityBalanceAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))
        const expectedScarcityAfter = 629033114806517760n
        assert.isTrue(scarcityBalanceAfter === expectedScarcityAfter)
    })

    it('adding liquidity as non burnable token does not burn', async function () {
        await this.regularToken.approve(this.behodler.address, 22n * FINNEY, { from: trader1 })
        await this.behodler.addLiquidity(this.regularToken.address, 22n * FINNEY, 0, 148323969, 148323969, { from: trader1 })

        const scarcityBalanceAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))
        const expectedScarcityAfter = 637046596067917824n
        assert.isTrue(scarcityBalanceAfter === expectedScarcityAfter, `${scarcityBalanceAfter}; ${expectedScarcityAfter}`)
    })

    it('adding liquidity as Eth produces correct scarcity', async function () {
        const weth = await this.behodler.Weth.call()
        expect(weth).to.be.a("string").that.equals(this.weth.address)

        await this.behodler.addLiquidity(weth, 22n * FINNEY, 0, 148323969, 148323969, { from: trader1, value: `${22n * FINNEY}` })

        const scarcityBalanceAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))
        const expectedScarcityAfter = 637046596067917824n
        assert.isTrue(scarcityBalanceAfter === expectedScarcityAfter, `${scarcityBalanceAfter}; ${expectedScarcityAfter}`)
    })

    it("withdrawing scarcity transfers out the correct number of tokens", async function () {
        //scarcity supply shrinks
        //token output is less than input due to scx burning.
        //add tokens. This should not be done via a mock. It has to be a little end-to-end
        await this.regularToken.approve(this.behodler.address, 22n * FINNEY, { from: trader1 })
        await this.behodler.addLiquidity(this.regularToken.address, 22n * FINNEY, 0, 148323969, 148323969, { from: trader1 })
        const tokenBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))
        const scarcityBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))

        const scxTotalSupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())

        await this.behodler.withdrawLiquidity(this.regularToken.address, scarcityBalanceBeforeWithdraw, 148323969, 3708100, 0, { from: trader1 })
        const scxAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))
        assert.isTrue(scxAfter === 0n)//.to.equal(0n)

        const scxTotalSupplyAfter = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scxTotalSupplyAfter).to.equal(scxTotalSupplyBefore - scarcityBalanceBeforeWithdraw)

        //scx burn fee translates into burn fee squared reduction in token
        const tokenBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))
        const balanceChange = tokenBalanceAfter - tokenBalanceBeforeWithdraw
        const feeOnToken = 0.000625 // scx burn fee squared = (0.025)^2
        const netTokenFactor = 0.999375 // 1-feeOnToken
        const million = 1000000n //adjustmentFactor
        const expectedBalanceChange = ((22n * 999375n * FINNEY) / million).toString()
        //   const expectedBalanceChange = ((2145n * FINNEY) / 100n).toString()
        const expectedApprox = expectedBalanceChange.substring(0, 6)
        const balanceChangeApprox = balanceChange.toString().substring(0, 6)

        //fixed point errors makes this only accurate to so many decimal places
        assert.equal(balanceChangeApprox, expectedApprox, `${balanceChangeApprox.toString()}; ${expectedApprox}`)
    })

    it('swap in burnable should swap out regular at correct exchange rate', async function () {
        await this.burnableToken.transfer(this.behodler.address, ONE, { from: trader1 })
        await this.regularToken.transfer(this.behodler.address, 16n * ONE, { from: trader1 })
        await this.burnableToken.approve(this.behodler.address, 2n * TEN, { from: trader1 })

        const rootOne = 1000000000n //rootI_i
        const rootOnePointTwoOne = 1100000000n //rootI_f

        const rootSixteen = 4000000000n //rootO_i

        const LHS = 31n * rootOnePointTwoOne - rootOne

        //√F(I_f - √I_i) = (√O_i - √O_f)/(F)
        //adjusted for fixed point arithmetic:
        //√F(I_f - √I_i)/√(1000) = ((√O_i - √O_f)*1000)/(F)
        //b == 25 so F == 999.975
        //√F = 31,√1000 = 31
        //LHS: (rootOnePointTwoOne - rootOne)
        //RHS((rootSixteen - root_finalO)*1000)/999

        //=>(999) * (rootOnePointTwoOne - rootOne ) = (rootSixteen - root_finalO)*1000
        //=> 999*(rootOnePointTwoOne - rootOne )/1000 = (rootSixteen - root_finalO)
        //=>root_finalO = rootSixteen - 999*(rootOnePointTwoOne - rootOne )/1000 
        const expected_rootO_f = rootSixteen - 975n * (rootOnePointTwoOne - rootOne) / 1000n

        //expect to receive 0.789 of O in exchange for 0.2 Input, implying that Input is more scarce and more valuable
        const inputBalanceBefore = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))

        await this.behodler.swap(this.burnableToken.address, this.regularToken.address, 31, rootOnePointTwoOne, rootOne, rootSixteen, expected_rootO_f, { from: trader1 });
     
        const inputBalanceAfter = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))

        const inputChange = (inputBalanceBefore - inputBalanceAfter).toString()
        const outputChange = (outputBalanceAfter - outputBalanceBefore).toString()

        assert.isTrue(inputChange === '210000000000000000')
        assert.isTrue(outputChange === '770493750000000000') 
    })
})