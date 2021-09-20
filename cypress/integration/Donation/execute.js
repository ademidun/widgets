import DePayWidgets from '../../../src'
import fetchMock from 'fetch-mock'
import mockBasics from '../../../tests/mocks/basics'
import React from 'react'
import ReactDOM from 'react-dom'
import { CONSTANTS } from 'depay-web3-constants'
import { mock, confirm, increaseBlock, resetMocks, anything } from 'depay-web3-mock'
import { resetCache, provider } from 'depay-web3-client'
import { routers, plugins } from 'depay-web3-payments'
import { Token } from 'depay-web3-tokens'
import { Transaction } from 'depay-web3-transaction'

describe('executes Donation', () => {

  const blockchain = 'ethereum'
  const accounts = ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']
  beforeEach(resetMocks)
  beforeEach(resetCache)
  beforeEach(()=>fetchMock.restore())
  beforeEach(()=>mock({ blockchain, accounts: { return: accounts } }))

  let DEPAY = '0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb'
  let DAI = CONSTANTS[blockchain].USD
  let ETH = CONSTANTS[blockchain].NATIVE
  let WETH = CONSTANTS[blockchain].WRAPPED
  let fromAddress = accounts[0]
  let toAddress = '0x4e260bB2b25EC6F3A59B478fCDe5eD5B8D783B02'
  let amount = 20
  let TOKEN_A_AmountBN
  let TOKEN_B_AmountBN
  let defaultArguments = {
    amount: {
      start: 20,
      min: 1,
      step: 1
    },
    token: DEPAY,
    blockchains: [blockchain],
    receiver: toAddress
  }

  beforeEach(()=>{

    ({ 
      TOKEN_A_AmountBN,
      TOKEN_B_AmountBN
    } = mockBasics({
      
      provider: provider(blockchain),
      blockchain,

      fromAddress,
      fromAddressAssets: [
        {
          "name": "Ether",
          "symbol": "ETH",
          "address": ETH,
          "type": "NATIVE"
        }, {
          "name": "Dai Stablecoin",
          "symbol": "DAI",
          "address": DAI,
          "type": "ERC20"
        }, {
          "name": "DePay",
          "symbol": "DEPAY",
          "address": DEPAY,
          "type": "ERC20"
        }
      ],
      
      toAddress,

      exchange: 'uniswap_v2',
      NATIVE_Balance: 0,

      TOKEN_A: DEPAY,
      TOKEN_A_Decimals: 18,
      TOKEN_A_Name: 'DePay',
      TOKEN_A_Symbol: 'DEPAY',
      TOKEN_A_Amount: amount,
      TOKEN_A_Balance: 30,
      
      TOKEN_B: DAI,
      TOKEN_B_Decimals: 18,
      TOKEN_B_Name: 'Dai Stablecoin',
      TOKEN_B_Symbol: 'DAI',
      TOKEN_B_Amount: 33,
      TOKEN_B_Balance: 50,
      TOKEN_B_Allowance: CONSTANTS[blockchain].MAXINT,

      TOKEN_A_TOKEN_B_Pair: CONSTANTS[blockchain].ZERO,
      TOKEN_B_WRAPPED_Pair: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11',
      TOKEN_A_WRAPPED_Pair: '0xEF8cD6Cb5c841A4f02986e8A8ab3cC545d1B8B6d',

      WRAPPED_AmountIn: 0.01,
      USD_AmountOut: 33,

      timeZone: 'Europe/Berlin',
      stubTimeZone: (timeZone)=> {
        cy.stub(Intl, 'DateTimeFormat', () => {
          return { resolvedOptions: ()=>{
            return { timeZone }
          }}
        })
      },

      currency: 'EUR',
      currencyToUSD: '0.85'
    }))
  })
  
  it('executes a sale', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        delay: 1000,
        from: fromAddress,
        to: routers[blockchain].address,
        api: routers[blockchain].api,
        method: 'route',
        params: {
          path: [DAI, WETH, DEPAY],
          amounts: [TOKEN_B_AmountBN, TOKEN_A_AmountBN, anything],
          addresses: [fromAddress, toAddress],
          plugins: [plugins[blockchain].uniswap_v2.address, plugins[blockchain].payment.address],
          data: []
        }
      }
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Donation({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.com/tx/')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
          expect(mockedTransaction.calls.count()).to.equal(1)
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
          confirm(mockedTransaction)
          cy.wait(1000).then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
              cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary.round .Checkmark.Icon').click()
              cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
            })
          })
        })
      })
    })
  })

  it('resets the payment if anything goes wrong during submission (like user denying signature)', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        delay: 1000,
        from: fromAddress,
        to: routers[blockchain].address,
        api: routers[blockchain].api,
        method: 'route',
        params: {
          path: [DAI, WETH, DEPAY],
          amounts: [TOKEN_B_AmountBN, TOKEN_A_AmountBN, anything],
          addresses: [fromAddress, toAddress],
          plugins: [plugins[blockchain].uniswap_v2.address, plugins[blockchain].payment.address],
          data: []
        },
        return: Error('MetaMask Tx Signature: User denied transaction signature.')
      }
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Donation({ ...defaultArguments, document })
        cy.get('.Card[title="Change payment"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
        cy.get('.Card[title="Change payment"]', { includeShadowDom: true }).should('not.exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...')
        // sent fails:
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('button[title="Close dialog"]')
        cy.get('.Card[title="Change payment"]', { includeShadowDom: true }).should('exist')
      })
    })
  })

  it('calls all callbacks (sent, confirmed, ensured)', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        delay: 1000,
        from: fromAddress,
        to: routers[blockchain].address,
        api: routers[blockchain].api,
        method: 'route',
        params: {
          path: [DAI, WETH, DEPAY],
          amounts: [TOKEN_B_AmountBN, TOKEN_A_AmountBN, anything],
          addresses: [fromAddress, toAddress],
          plugins: [plugins[blockchain].uniswap_v2.address, plugins[blockchain].payment.address],
          data: []
        }
      }
    })


    let sentCalledWith
    let ensuredCalledWith
    let confirmedCalledWith

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Donation({ ...defaultArguments, document,
          sent: (transaction)=>{ sentCalledWith = transaction },
          confirmed: (transaction)=>{ confirmedCalledWith = transaction },
          ensured: (transaction)=>{ ensuredCalledWith = transaction },
        })
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
          cy.wait(1000).then(()=>{
            expect(sentCalledWith).to.be.an.instanceof(Transaction)
            expect(sentCalledWith.from).to.equal(accounts[0])
            expect(mockedTransaction.calls.count()).to.equal(1)
            confirm(mockedTransaction)
            cy.wait(5000).then(()=>{
              expect(confirmedCalledWith).to.be.an.instanceof(Transaction)
              expect(confirmedCalledWith.from).to.equal(accounts[0])
              increaseBlock(12)
              cy.wait(5000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary.round .Checkmark.Icon').click().then(()=>{
                  expect(ensuredCalledWith).to.be.an.instanceof(Transaction)
                  expect(ensuredCalledWith.from).to.equal(accounts[0])
                })
              })
            })
          })
        })
      })
    })
  })
})
