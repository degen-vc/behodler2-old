const { accounts, contract } = require('@openzeppelin/test-environment');
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Scarcity = contract.fromArtifact('Scarcity');
const mockToken1 = contract.fromArtifact('MockToken1')

describe('Scarcity', function () {
    const [owner, notOwner, migrator, feeDestination] = accounts;

    beforeEach(async function () {
        this.scarcity = await Scarcity.new({ from: owner });
    });

    it('non owner fails to configure', async function () {
        await expectRevert(this.scarcity.configureScarcity(10, 10, owner, { from: notOwner }), "Ownable: caller is not the owner")
    });

    it('non owner fails to set migrator', async function () {
        await expectRevert(this.scarcity.setMigrator(owner, { from: notOwner }), "Ownable: caller is not the owner")
    });

    it('minting fails for non migrator', async function () {
        await this.scarcity.setMigrator(migrator, { from: owner })
        await expectRevert(this.scarcity.migrateMint(owner, 10, { from: feeDestination }), "SCARCITY: Migration contract only")
    });

    it('minting by migrator increases supply', async function () {
        const initalSupply = new BN('0');
        let supply = await this.scarcity.totalSupply()
        expect(supply).to.be.bignumber.equal(initalSupply);

        const balanceOfNotOwnerBefore = await this.scarcity.balanceOf(notOwner)

        await this.scarcity.setMigrator(migrator, { from: owner })
        await this.scarcity.migrateMint(notOwner, 10000, { from: migrator })

        const balanceOfNotOwnerAfter = await this.scarcity.balanceOf(notOwner)

        const supplyAfterMint = new BN('10000')
        supply = await this.scarcity.totalSupply()
        expect(supply).to.be.bignumber.equal(supplyAfterMint);

        expect(balanceOfNotOwnerAfter.sub(balanceOfNotOwnerBefore)).to.be.bignumber.equal(supplyAfterMint);
    });

    it('transferFrom requires approval, allowance updated', async function () {
        await this.scarcity.setMigrator(migrator, { from: owner })
        await this.scarcity.migrateMint(notOwner, 10000, { from: migrator })

        await expectRevert(this.scarcity.transferFrom(notOwner, owner, 100, { from: owner }), 'ERC20: transfer amount exceeds allowance')

        await this.scarcity.approve(owner, 100, { from: notOwner })

        const amount = new BN('100')
        const zero = new BN('0')
        const balanceAfter = new BN('9900')

        const allowance = await this.scarcity.allowance(notOwner, owner)
        expect(allowance).to.be.bignumber.equal(amount)

        await this.scarcity.transferFrom(notOwner, owner, 100, { from: owner })

        const balanceOfNotOwner = await this.scarcity.balanceOf(notOwner)
        expect(balanceOfNotOwner).to.be.bignumber.equal(balanceAfter)

        const balanceOfOwner = await this.scarcity.balanceOf(owner)
        expect(balanceOfOwner).to.be.bignumber.equal(amount)

        const allowanceAfterTransferFrom = await this.scarcity.allowance(notOwner, owner)
        expect(allowanceAfterTransferFrom).to.be.bignumber.equal(zero)
    });

    it('metadata correct', async function () {
        expect(await this.scarcity.name()).to.equal('Scarcity')
        expect(await this.scarcity.decimals()).to.be.bignumber.equal(new BN('18'))
        expect(await this.scarcity.symbol()).to.equal('SCX')
    });

    it('transfer and transferFrom both exact correct fees/burning, destination richer', async function () {
        await this.scarcity.setMigrator(migrator, { from: owner })
        await this.scarcity.migrateMint(notOwner, 10000, { from: migrator })
        await this.scarcity.configureScarcity(20, 300, feeDestination, { from: owner })

        const supplyBefore = await this.scarcity.totalSupply()
        expect(supplyBefore).to.be.bignumber.equal(new BN('10000'))

        const notOwnerBalance = await this.scarcity.balanceOf(notOwner)
        expect(notOwnerBalance).to.be.bignumber.equal(new BN('10000'))

        await this.scarcity.transfer(owner, 2000, { from: notOwner })

        const supplyAfter = await this.scarcity.totalSupply()
        expect(supplyAfter).to.be.bignumber.equal(new BN('9400'))

        const balanceOfNotOwner = await this.scarcity.balanceOf(notOwner)
        expect(balanceOfNotOwner).to.be.bignumber.equal(new BN('8000'))

        const balanceOfOwner = await this.scarcity.balanceOf(owner)
        expect(balanceOfOwner).to.be.bignumber.equal(new BN('1360'))

        const balancOfFeeDestination = await this.scarcity.balanceOf(feeDestination)
        expect(balancOfFeeDestination).to.be.bignumber.equal(new BN('40'))

        await this.scarcity.approve(owner, 100, { from: notOwner })
        await this.scarcity.transferFrom(notOwner, owner, 60, { from: owner })

        const allowance = await this.scarcity.allowance(notOwner, owner)
        expect(allowance).to.be.bignumber.equal(new BN('40'))

        const totalSupplyAfterTransferFrom = await this.scarcity.totalSupply()
        expect(totalSupplyAfterTransferFrom).to.be.bignumber.equal(new BN('9382'))

        const balanceOfOwnerAfterFrom = await this.scarcity.balanceOf(owner)
        expect(balanceOfOwnerAfterFrom).to.be.bignumber.equal(new BN('1401'))
    });
});