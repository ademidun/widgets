import closeWidget from '../../../tests/helpers/closeWidget'
import DePayWidgets from '../../../src'
import fetchMock from 'fetch-mock'
import mockBasics from '../../../tests/mocks/basics'
import mockAmountsOut from '../../../tests/mocks/amountsOut'
import React from 'react'
import ReactDOM from 'react-dom'
import { CONSTANTS } from '@depay/web3-constants'
import { ethers } from 'ethers'
import { mock, confirm, resetMocks, anything } from '@depay/web3-mock'
import { resetCache, provider } from '@depay/web3-client'
import { routers, plugins } from '@depay/web3-payments'
import { Token } from '@depay/web3-tokens'

describe('Payment Widget: value loss safeguard', () => {

  const blockchain = 'ethereum'
  const accounts = ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045']
  beforeEach(resetMocks)
  beforeEach(resetCache)
  beforeEach(()=>fetchMock.restore())
  beforeEach(()=>mock({ blockchain, accounts: { return: accounts } }))
  afterEach(closeWidget)

  let DEPAY = '0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb'
  let DAI = CONSTANTS[blockchain].USD
  let ETH = CONSTANTS[blockchain].NATIVE
  let WETH = CONSTANTS[blockchain].WRAPPED
  let WRAPPED_AmountInBN
  let TOKEN_A_AmountBN
  let TOKEN_B_AmountBN
  let toAddress = '0x4e260bB2b25EC6F3A59B478fCDe5eD5B8D783B02'
  let amount = 1.8
  let exchange
  let defaultArguments = {
    accept:[{
      blockchain,
      token: DEPAY,
      receiver: toAddress
    }]
  }

  beforeEach(()=>{
    ({
      WRAPPED_AmountInBN,
      TOKEN_A_AmountBN,
      TOKEN_B_AmountBN,
      exchange
    } = mockBasics({
      provider: provider(blockchain),
      blockchain,
      fromAddress: accounts[0],
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
          "type": "20"
        }, {
          "name": "DePay",
          "symbol": "DEPAY",
          "address": DEPAY,
          "type": "20"
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
      TOKEN_A_Balance: 0,
      
      TOKEN_B: DAI,
      TOKEN_B_Decimals: 18,
      TOKEN_B_Name: 'Dai Stablecoin',
      TOKEN_B_Symbol: 'DAI',
      TOKEN_B_Amount: 1.16,
      TOKEN_B_Balance: 50,
      TOKEN_B_Allowance: CONSTANTS[blockchain].MAXINT,

      TOKEN_A_TOKEN_B_Pair: CONSTANTS[blockchain].ZERO,
      TOKEN_B_WRAPPED_Pair: '0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11',
      TOKEN_A_WRAPPED_Pair: '0xEF8cD6Cb5c841A4f02986e8A8ab3cC545d1B8B6d',

      WRAPPED_AmountIn: 0.01,
      USD_AmountOut: 1.16,

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

    mockAmountsOut({
      provider: provider(blockchain),
      blockchain,
      exchange,
      amountInBN: '1176470588235294200',
      path: [DAI, WETH, DEPAY],
      amountsOut: [
        '1176470588235294200',
        WRAPPED_AmountInBN,
        TOKEN_A_AmountBN
      ]
    })
  })
  
  describe('prevents payments that would lose to much value', () => {

    it('shows a warning and prevents payment', ()=> {
      let fromAddress = accounts[0]
      mockAmountsOut({
        provider: provider(blockchain),
        blockchain,
        exchange,
        amountInBN: '11764705882352942000',
        path: [DAI, WETH, DEPAY],
        amountsOut: [
          '11764705882352942000',
          WRAPPED_AmountInBN.mul(10),
          TOKEN_A_AmountBN.mul(10)
        ]
      })
      mock({
        provider: provider(blockchain),
        blockchain,
        call: {
          to: exchange.contracts.router.address,
          api: exchange.contracts.router.api,
          method: 'getAmountsIn',
          params: [ethers.utils.parseUnits('18', 18), [DAI, WETH, DEPAY]],
          return: [ethers.utils.parseUnits('18', 18), ethers.utils.parseUnits('0.05', 18), ethers.utils.parseUnits('11.6', 18)]
        }
      })
      mockAmountsOut({
        provider: provider(blockchain),
        blockchain,
        exchange,
        amountInBN: ethers.utils.parseUnits('18', 18),
        path: [DEPAY, WETH, DAI],
        amountsOut: [
          ethers.utils.parseUnits('18', 18),
          ethers.utils.parseUnits('0.05', 18),
          ethers.utils.parseUnits('11.6', 18)
        ]
      })

      cy.visit('cypress/test.html').then((contentWindow) => {
        cy.document().then((document)=>{
          DePayWidgets.Payment({ ...defaultArguments, document })
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card[title="Change amount"]').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('input[name="amount"]').type('{selectall}', { force: true })
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('input').type('10', { force: true })
          cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Done').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Alert', "Payment token would lose 36% of it's value!").should('exist')
          cy.wait(1000).then(()=>{
            cy.get('.ButtonPrimary.disabled', { includeShadowDom: true }).should('exist')
          })
        })
      })
    })
  })
})

