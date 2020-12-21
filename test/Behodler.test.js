const { accounts, contract } = require('@openzeppelin/test-environment');
const { expectEvent, expectRevert, ether, balance } = require('@openzeppelin/test-helpers');
const { expect, assert } = require('chai');
const { BNtoBigInt } = require('./helpers/BigIntUtil');
const bigNum = require('./helpers/BigIntUtil')

const Behodler = contract.fromArtifact('Behodler');
const AddressBalanceCheck = contract.fromArtifact('AddressBalanceCheck');
const MockToken1 = contract.fromArtifact('MockToken1')
const MockWeth = contract.fromArtifact('MockWeth')
const OpenArbiter = contract.fromArtifact('OpenArbiter')
const Lachesis = contract.fromArtifact('Lachesis')
const LiquidityReceiver = contract.fromArtifact('LiquidityReceiver')
const PyroToken = contract.fromArtifact('Pyrotoken');
const IndirectSwap = contract.fromArtifact('IndirectSwap')

const TEN = 10000000000000000000n
const ONE = 1000000000000000000n
const FINNEY = 1000000000000000n


describe('Behodler1', async function () {
    const [owner, trader1, trader2, feeDestination, weiDaiReserve] = accounts;

    beforeEach(async function () {
        const addressBalanceCheckLib = await AddressBalanceCheck.new()
        await Behodler.detectNetwork()
        await Behodler.link('AddressBalanceCheck', addressBalanceCheckLib.address)
        this.behodler = await Behodler.new({ from: owner });

        this.liquidityReceiver = await LiquidityReceiver.new({ from: owner });
        this.indirectSwap = await IndirectSwap.new(this.behodler.address, { from: owner });

        this.weth = await MockWeth.new({ from: owner })
        this.regularToken = await MockToken1.new({ from: owner })
        this.pyroRegular = await PyroToken.new(this.regularToken.address, this.liquidityReceiver.address)

        this.dai = await MockToken1.new({ from: owner })
        this.burnableToken = await MockToken1.new({ from: owner })
        this.eye = await MockToken1.new({ from: owner })
        this.invalidToken = await MockToken1.new({ from: owner })
        this.flashLoanArbiter = await OpenArbiter.new({ from: owner })
        this.lachesis = await Lachesis.new({ from: owner })
        await this.regularToken.mint(trader1, 2000000n * TEN)
        await this.burnableToken.mint(trader1, 2000000n * TEN)
        await this.invalidToken.mint(trader1, TEN)

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, this.liquidityReceiver.address, weiDaiReserve, this.dai.address, { from: owner })
        await this.behodler.configureScarcity(110, 25, feeDestination, { from: owner })
        await this.lachesis.measure(this.regularToken.address, true, false, { from: owner })
        await this.lachesis.measure(this.burnableToken.address, true, true, { from: owner })

        await this.lachesis.setBehodler(this.behodler.address, { from: owner })
        await this.lachesis.updateBehodler(this.regularToken.address, { from: owner })
        await this.lachesis.updateBehodler(this.burnableToken.address, { from: owner })
    })

    it('adding burnable token as liquidity in 2 batches generates the correct volume of Scarcity', async function () {
        //ADD 1 FINNEY WHEN BEHODLER BALANCE OF TOKEN ZERO
        const originalBalance = 2000000n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scarcitySupplyBefore).to.equal(0n)

        await this.burnableToken.approve(this.behodler.address, originalBalance, { from: trader1 })
        await this.behodler.addLiquidity(this.burnableToken.address, FINNEY * 2n, { from: trader1 })
        const tokenBalanceOfUser = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUser).to.equal(expectedBalanceAfter)

        const scarcityBalance = (await this.behodler.balanceOf.call(trader1)).toString()

        const expectedScarcity = '936954321551396916649'
        expect(scarcityBalance).to.equal(expectedScarcity)

        const scarcitySupplyAfter = (await bigNum.BNtoBigInt(this.behodler.totalSupply.call())).toString()
        expect(scarcitySupplyAfter).to.equal(expectedScarcity)

        await this.behodler.addLiquidity(this.burnableToken.address, 2n * FINNEY, { from: trader1 })
        const expectedBalanceAfterSecondAdd = expectedBalanceAfter - 2n * FINNEY
        const tokenBalanceOfUserAfterSecondAdd = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUserAfterSecondAdd).to.equal(expectedBalanceAfterSecondAdd)

        const scarcityBalanceAfterSecondAdd = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

        const expectedScarcityAfterSecondAdd = '955401065625106468265'
        assert.isTrue(scarcityBalanceAfterSecondAdd.toString() === expectedScarcityAfterSecondAdd, `${expectedScarcityAfterSecondAdd}; ${scarcityBalanceAfterSecondAdd}`)

        await this.behodler.addLiquidity(this.burnableToken.address, 2n * FINNEY, { from: trader1 })
        const expectedBalanceAfterThirdAdd = expectedBalanceAfterSecondAdd - 2n * FINNEY
        const tokenBalanceOfUserAfterThirdAdd = await bigNum.BNtoBigInt(this.burnableToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUserAfterThirdAdd).to.equal(expectedBalanceAfterThirdAdd)

        const scarcityBalanceAfterThirdAdd = await bigNum.BNtoBigInt(this.behodler.balanceOf.call(trader1))

        const expectedScarcityAfterThirdAdd = '966191719168626775368'
        assert.isTrue(scarcityBalanceAfterThirdAdd.toString() === expectedScarcityAfterThirdAdd, `${expectedScarcityAfterThirdAdd}; ${scarcityBalanceAfterThirdAdd}`)
    })


    it('adding liquidity as non burnable token does not burn', async function () {
        const originalBalance = 2000000n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scarcitySupplyBefore).to.equal(0n)

        await this.regularToken.approve(this.behodler.address, originalBalance, { from: trader1 })
        await this.behodler.addLiquidity(this.regularToken.address, FINNEY * 2n, { from: trader1 })
        const tokenBalanceOfUser = await bigNum.BNtoBigInt(this.regularToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUser).to.equal(expectedBalanceAfter)

        const scarcityBalance = (await this.behodler.balanceOf.call(trader1)).toString()

        const expectedScarcity = '936954321551396916649'
        expect(scarcityBalance).to.equal(expectedScarcity)

        const scarcitySupplyAfter = (await bigNum.BNtoBigInt(this.behodler.totalSupply.call())).toString()
        expect(scarcitySupplyAfter).to.equal(expectedScarcity)
    })

    it('adding liquidity as Eth produces correct scarcity', async function () {
        const weth = await this.behodler.Weth.call()
        expect(weth).to.be.a("string").that.equals(this.weth.address)

        const ethBalanceBefore = await bigNum.BNtoBigInt(balance.current(trader1))

        await this.behodler.addLiquidity(weth, FINNEY * 2n, { from: trader1, value: (FINNEY * 2n).toString() })

        const ethBalanceAfter = (await bigNum.BNtoBigInt(balance.current(trader1))).toString()

        const scarcityBalance = (await this.behodler.balanceOf.call(trader1)).toString()

        const expectedScarcity = '936954321551396916649'
        expect(scarcityBalance).to.equal(expectedScarcity)

        const scarcitySupplyAfter = (await bigNum.BNtoBigInt(this.behodler.totalSupply.call())).toString()
        expect(scarcitySupplyAfter).to.equal(expectedScarcity)
    })

    it("withdrawing scarcity transfers out the correct number of tokens", async function () {
        //scarcity supply shrinks
        await this.regularToken.approve(this.behodler.address, 22n * FINNEY, { from: trader1 })
        await this.behodler.addLiquidity(this.regularToken.address, 22n * FINNEY, { from: trader1 })
        const tokenBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))
        const scarcityBalanceBeforeWithdraw = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))

        const scxTotalSupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        const behodlerBalanceOfTokensBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        await this.behodler.withdrawLiquidity(this.regularToken.address, behodlerBalanceOfTokensBefore / 3n, { from: trader1 })
        const behodlerBalanceOfTokensAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        assert.equal(behodlerBalanceOfTokensAfter.toString(), ((behodlerBalanceOfTokensBefore * 2n) / 3n).toString())

        const scxAfter = await bigNum.BNtoBigInt(this.behodler.balanceOf(trader1))
        const expectedSCXAfter = scarcityBalanceBeforeWithdraw - 10790653543520307104n;
        expect(scxAfter.toString()).to.equal(expectedSCXAfter.toString())

        const scxTotalSupplyAfter = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scxTotalSupplyAfter.toString()).to.equal((scxTotalSupplyBefore - 10790653543520307104n).toString())
    })

    it('swap in burnable should swap out regular at correct exchange rate', async function () {
        await this.burnableToken.transfer(this.behodler.address, ONE, { from: trader1 })
        await this.regularToken.transfer(this.behodler.address, 16n * ONE, { from: trader1 })
        await this.burnableToken.approve(this.behodler.address, 2n * TEN, { from: trader1 })

        const initialInputBalance = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(this.behodler.address))
        const initialOutputBalance = await await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        const inputAmount = FINNEY * 10n
        const netInputAmount = (inputAmount * 975n) / 1000n
        const expectedFinalInputBalance = initialInputBalance + netInputAmount

        let finalOutputBalance = (initialInputBalance * initialOutputBalance) / expectedFinalInputBalance

        let outputAmount = initialOutputBalance - finalOutputBalance
        let initials = initialInputBalance * initialOutputBalance
        let finals = expectedFinalInputBalance * finalOutputBalance
        let residual = initials - finals
        const precision = 1000000000000000000n
        const inputRatio = (expectedFinalInputBalance * precision) / initialInputBalance
        const outputRatio = (initialOutputBalance * precision) / finalOutputBalance

        const inputBalanceBefore = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))
        await this.behodler.swap(this.burnableToken.address, this.regularToken.address, FINNEY * 10n, outputAmount, { from: trader1 });
        const inputBalanceAfter = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))

        const inputChange = (inputBalanceBefore - inputBalanceAfter).toString()
        const outputChange = (outputBalanceAfter - outputBalanceBefore).toString()
        assert.equal(inputChange, inputAmount.toString())
        assert.equal(outputChange, outputAmount.toString())
    })

    it('fake Janus has the same effect as direct swap', async function () {
        await this.burnableToken.transfer(this.behodler.address, ONE, { from: trader1 })
        await this.regularToken.transfer(this.behodler.address, 16n * ONE, { from: trader1 })
        await this.burnableToken.approve(this.indirectSwap.address, 2n * TEN, { from: trader1 })

        const initialInputBalance = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(this.behodler.address))
        const initialOutputBalance = await await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.behodler.address))
        const inputAmount = FINNEY * 10n
        const netInputAmount = (inputAmount * 975n) / 1000n
        const expectedFinalInputBalance = initialInputBalance + netInputAmount

        let finalOutputBalance = (initialInputBalance * initialOutputBalance) / expectedFinalInputBalance

        let outputAmount = initialOutputBalance - finalOutputBalance
        let initials = initialInputBalance * initialOutputBalance
        let finals = expectedFinalInputBalance * finalOutputBalance
        let residual = initials - finals
        const precision = 1000000000000000000n
        const inputRatio = (expectedFinalInputBalance * precision) / initialInputBalance
        const outputRatio = (initialOutputBalance * precision) / finalOutputBalance

        const inputBalanceBefore = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))

        await this.indirectSwap.swap(this.burnableToken.address, this.regularToken.address, FINNEY * 10n, outputAmount, { from: trader1 });
        const inputBalanceAfter = await bigNum.BNtoBigInt(this.burnableToken.balanceOf(trader1))
        const outputBalanceAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(trader1))

        const inputChange = (inputBalanceBefore - inputBalanceAfter).toString()
        const outputChange = (outputBalanceAfter - outputBalanceBefore).toString()
        assert.equal(inputChange, inputAmount.toString())
        assert.equal(outputChange, outputAmount.toString())
    })
})

describe('Behodler2: Pyrotoken', async function () {
    const [owner, trader1, trader2, feeDestination, weiDaiReserve] = accounts;

    beforeEach(async function () {
        const addressBalanceCheckLib = await AddressBalanceCheck.new()
        await Behodler.detectNetwork()
        await Behodler.link('AddressBalanceCheck', addressBalanceCheckLib.address)
        this.behodler = await Behodler.new({ from: owner });

        this.liquidityReceiver = await LiquidityReceiver.new({ from: owner });
        this.weth = await MockWeth.new({ from: owner })
        this.regularToken = await MockToken1.new({ from: owner })
        this.pyroRegular = await PyroToken.new(this.regularToken.address, this.liquidityReceiver.address)

        this.dai = await MockToken1.new({ from: owner })
        this.burnableToken = await MockToken1.new({ from: owner })
        this.eye = await MockToken1.new({ from: owner })
        this.invalidToken = await MockToken1.new({ from: owner })
        this.flashLoanArbiter = await OpenArbiter.new({ from: owner })
        this.lachesis = await Lachesis.new({ from: owner })
        await this.regularToken.mint(trader1, 2n * TEN)
        await this.burnableToken.mint(trader1, 2n * TEN)
        await this.invalidToken.mint(trader1, TEN)

        await this.behodler.seed(this.weth.address, this.lachesis.address, this.flashLoanArbiter.address, this.liquidityReceiver.address, weiDaiReserve, this.dai.address, { from: owner })
        await this.behodler.configureScarcity(110, 25, feeDestination, { from: owner })
        await this.lachesis.measure(this.regularToken.address, true, false, { from: owner })
        await this.lachesis.measure(this.burnableToken.address, true, true, { from: owner })

        await this.lachesis.setBehodler(this.behodler.address, { from: owner })
        await this.lachesis.updateBehodler(this.regularToken.address, { from: owner })
        await this.lachesis.updateBehodler(this.burnableToken.address, { from: owner })
    })

    it('adding liquidity as non burnable fills liquidity receiver which fills pyrotoken', async function () {
        this.timeout(500000);

        const originalBalance = 2n * TEN
        const expectedBalanceAfter = originalBalance - FINNEY * 2n

        const scarcitySupplyBefore = await bigNum.BNtoBigInt(this.behodler.totalSupply.call())
        expect(scarcitySupplyBefore.toString()).to.equal((0n).toString())

        await this.regularToken.approve(this.behodler.address, originalBalance, { from: trader1 })
        await this.behodler.addLiquidity(this.regularToken.address, FINNEY * 2n, { from: trader1 })
        const tokenBalanceOfUser = await bigNum.BNtoBigInt(this.regularToken.balanceOf.call(trader1))
        expect(tokenBalanceOfUser.toString()).to.equal(expectedBalanceAfter.toString())

        const scarcityBalance = (await this.behodler.balanceOf.call(trader1)).toString()

        const expectedScarcity = '936954321551396916649'
        expect(scarcityBalance).to.equal(expectedScarcity)

        const scarcitySupplyAfter = (await bigNum.BNtoBigInt(this.behodler.totalSupply.call())).toString()
        expect(scarcitySupplyAfter).to.equal(expectedScarcity)
        const balanceOfLiquidityReceiverBefore = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.liquidityReceiver.address))
        assert.equal(balanceOfLiquidityReceiverBefore.toString(), (BigInt(5 * Math.pow(10, 13))).toString());
        const redeemRateBeforeMint = await bigNum.BNtoBigInt(this.pyroRegular.redeemRate())
        assert.equal(redeemRateBeforeMint.toString(), ONE.toString())

        await this.regularToken.approve(this.pyroRegular.address, FINNEY * 3n, { from: trader1 })

        await this.pyroRegular.mint(FINNEY, { from: trader1 })
        const pyroBalance = await bigNum.BNtoBigInt(this.pyroRegular.balanceOf(trader1))
        assert.equal(FINNEY.toString(), pyroBalance.toString())
        const redeemRateAfterMint = await bigNum.BNtoBigInt(this.pyroRegular.redeemRate())
        assert.equal(redeemRateAfterMint.toString(), (1050000000000000000n).toString())

        const balanceOfLiquidityReceiverAfter = await bigNum.BNtoBigInt(this.regularToken.balanceOf(this.liquidityReceiver.address))
        assert.equal(balanceOfLiquidityReceiverAfter.toString(), "0");

        const redeemRateAfter = await bigNum.BNtoBigInt(this.pyroRegular.redeemRate())
        assert.equal(redeemRateAfter.toString(), "1050000000000000000");
        await this.regularToken.approve(this.behodler.address, FINNEY * 100n, { from: trader1 })

        await this.pyroRegular.mint(FINNEY, { from: trader1 })
        const redeemRateAfterSecondMint = await bigNum.BNtoBigInt(this.pyroRegular.redeemRate())
    })

})
