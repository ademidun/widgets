import DePayWidgets from '../../../src'
import fetchMock from 'fetch-mock'
import mockBasics from '../../../tests/mocks/basics'
import React from 'react'
import ReactDOM from 'react-dom'
import { CONSTANTS } from '@depay/web3-constants'
import { mock, confirm, fail, increaseBlock, resetMocks, replace } from '@depay/web3-mock'
import { resetCache, provider } from '@depay/web3-client'
import { routers, plugins } from '@depay/web3-payments'
import { Server } from 'mock-socket'
import { Token } from '@depay/web3-tokens'

describe('Payment Widget: detects replaced transaction', () => {

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
  let defaultArguments = {
    accept: [{
      blockchain,
      amount,
      token: DEPAY,
      receiver: toAddress
    }]
  }

  beforeEach(()=>{

    ({ TOKEN_A_AmountBN } = mockBasics({
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
      TOKEN_A_Balance: 30,
      
      TOKEN_B: DAI,
      TOKEN_B_Decimals: 18,
      TOKEN_B_Name: 'Dai Stablecoin',
      TOKEN_B_Symbol: 'DAI',
      TOKEN_B_Amount: 33,
      TOKEN_B_Balance: 50,

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
  
  it('detects replaced transaction on client side and still confirms it if replaced transaction was successful', () => {
    let transaction = {
      from: fromAddress,
      to: DEPAY,
      api: Token[blockchain].DEFAULT,
      method: 'transfer',
      params: [toAddress, TOKEN_A_AmountBN]
    }
    
    let mockedTransaction = mock({
      blockchain,
      transaction
    })

    fetchMock.post({
      url: "https://public.depay.fi/payments",
      body: {
        after_block: 1,
        amount: "20.0",
        blockchain: "ethereum",
        confirmations: 1,
        fee_amount: null,
        fee_receiver: null,
        nonce: 0,
        payload: {
          sender_amount: "20.0",
          sender_id: fromAddress.toLowerCase(),
          sender_token_id: DEPAY,
          type: 'payment'
        },
        receiver: toAddress,
        sender: fromAddress.toLowerCase(),
        token: DEPAY,
        transaction: mockedTransaction.transaction._id,
        uuid: mockedTransaction.transaction._id,
      },
    }, 201)

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
          let replacingTransactionMock = mock({
            blockchain,
            transaction
          })
          replace(mockedTransaction, replacingTransactionMock)
          cy.wait(1000).then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionMock.transaction._id}`)
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
              cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
              cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
            })
          })
        })
      })
    })
  })

  it('detects replaced transaction on client side and shows error if replaced transaction failed', () => {
    let transaction = {
      from: fromAddress,
      to: DEPAY,
      api: Token[blockchain].DEFAULT,
      method: 'transfer',
      params: [toAddress, TOKEN_A_AmountBN]
    }
    
    let mockedTransaction = mock({
      blockchain,
      transaction
    })

    fetchMock.post({
      url: "https://public.depay.fi/payments",
      body: {
        after_block: 1,
        amount: "20.0",
        blockchain: "ethereum",
        confirmations: 1,
        fee_amount: null,
        fee_receiver: null,
        nonce: 0,
        payload: {
          sender_amount: "20.0",
          sender_id: fromAddress.toLowerCase(),
          sender_token_id: DEPAY,
          type: 'payment'
        },
        receiver: toAddress,
        sender: fromAddress.toLowerCase(),
        token: DEPAY,
        transaction: mockedTransaction.transaction._id,
        uuid: mockedTransaction.transaction._id,
      },
    }, 201)

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
          let replacingTransactionMock = mock({
            blockchain,
            transaction
          })
          replace(mockedTransaction, replacingTransactionMock, false)
          cy.wait(1000).then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('a', 'View on explorer').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionMock.transaction._id}`)
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('h1').should('contain.text', 'Payment Failed')
            cy.get('button[title="Go back"]', { includeShadowDom: true }).should('exist')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Try again').click()
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          })
        })
      })
    })
  })

  describe("replaced transaction detected by tracker via websockets", ()=>{
    let mockedWebsocketServer = new Server('wss://integrate.depay.fi/cable')
    let websocketMessages = []
    let mockedWebsocket

    beforeEach(()=>{
      mockedWebsocketServer.on('connection', socket => {
        mockedWebsocket = socket
        mockedWebsocket.on('message', data => {
          websocketMessages.push(data)
        })
      })
    })

    it('detects replaced transaction via tracker and confirms it if replaced transaction was successful', () => {
      let transaction = {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
      
      let mockedTransaction = mock({
        blockchain,
        transaction
      })

      fetchMock.post({
        url: "https://public.depay.fi/payments",
        body: {
          after_block: 1,
          amount: "20.0",
          blockchain: "ethereum",
          confirmations: 1,
          fee_amount: null,
          fee_receiver: null,
          nonce: 0,
          payload: {
            sender_amount: "20.0",
            sender_id: fromAddress.toLowerCase(),
            sender_token_id: DEPAY,
            type: 'payment'
          },
          receiver: toAddress,
          sender: fromAddress.toLowerCase(),
          token: DEPAY,
          transaction: mockedTransaction.transaction._id,
          uuid: mockedTransaction.transaction._id,
        },
      }, 201)

      cy.visit('cypress/test.html').then((contentWindow) => {
        cy.document().then((document)=>{
          DePayWidgets.Payment({ ...defaultArguments, document })
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
            cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
            cy.wait(1000).then(()=>{
              expect(!!websocketMessages.find((rawMessage)=>{
                let message = JSON.parse(rawMessage)
                return(
                  message.command == 'subscribe' &&
                  message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'TransactionChannel' })
                )
              })).to.equal(true)
              let replacingTransactionId = '0x782cf9983541087548c717dc1a4e2687ef8928e758316cd600ebb0652f57bafe'
              mockedWebsocket.send(JSON.stringify({
                message: {
                  id: replacingTransactionId,
                  status: 'success'
                }
              }))
              cy.wait(1000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionId}`)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
                  cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                })
              })
            })
          })
        })
      })
    })

    it('detects replaced transaction via tracker and fails it if replaced transaction failed', () => {
      let transaction = {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
      
      let mockedTransaction = mock({
        blockchain,
        transaction
      })

      fetchMock.post({
        url: "https://public.depay.fi/payments",
        body: {
          after_block: 1,
          amount: "20.0",
          blockchain: "ethereum",
          confirmations: 1,
          fee_amount: null,
          fee_receiver: null,
          nonce: 0,
          payload: {
            sender_amount: "20.0",
            sender_id: fromAddress.toLowerCase(),
            sender_token_id: DEPAY,
            type: 'payment'
          },
          receiver: toAddress,
          sender: fromAddress.toLowerCase(),
          token: DEPAY,
          transaction: mockedTransaction.transaction._id,
          uuid: mockedTransaction.transaction._id,
        },
      }, 201)

      cy.visit('cypress/test.html').then((contentWindow) => {
        cy.document().then((document)=>{
          DePayWidgets.Payment({ ...defaultArguments, document })
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
            cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
            cy.wait(1000).then(()=>{
              expect(!!websocketMessages.find((rawMessage)=>{
                let message = JSON.parse(rawMessage)
                return(
                  message.command == 'subscribe' &&
                  message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'TransactionChannel' })
                )
              })).to.equal(true)
              let replacingTransactionId = '0x782cf9983541087548c717dc1a4e2687ef8928e758316cd600ebb0652f57bafe'
              mockedWebsocket.send(JSON.stringify({
                message: {
                  id: replacingTransactionId,
                  status: 'failed'
                }
              }))
              cy.wait(1000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('a', 'View on explorer').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionId}`)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('h1').should('contain.text', 'Payment Failed')
                cy.get('button[title="Go back"]', { includeShadowDom: true }).should('exist')
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Try again').click()
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
              })
            })
          })
        })
      })
    })
  })

  describe("replaced transaction detected by polling transaction state", ()=>{

    it('detects replaced transaction via transaction state endpoint and confirms it if replaced transaction was successful', () => {
      let transaction = {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
      
      let mockedTransaction = mock({
        blockchain,
        transaction
      })

      fetchMock.post({
        url: "https://public.depay.fi/payments",
        body: {
          after_block: 1,
          amount: "20.0",
          blockchain: "ethereum",
          confirmations: 1,
          fee_amount: null,
          fee_receiver: null,
          nonce: 0,
          payload: {
            sender_amount: "20.0",
            sender_id: fromAddress.toLowerCase(),
            sender_token_id: DEPAY,
            type: 'payment'
          },
          receiver: toAddress,
          sender: fromAddress.toLowerCase(),
          token: DEPAY,
          transaction: mockedTransaction.transaction._id,
          uuid: mockedTransaction.transaction._id,
        },
      }, 201)

      cy.visit('cypress/test.html').then((contentWindow) => {
        cy.document().then((document)=>{
          DePayWidgets.Payment({ ...defaultArguments, document })
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
            cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
            let replacingTransactionId = '0x782cf9983541087548c717dc1a4e2687ef8928e758316cd600ebb0652f57bafe'
            cy.wait(1000).then(()=>{
              fetchMock.get({
                url: `https://public.depay.fi/transactions/${blockchain}/${fromAddress.toLowerCase()}/0`,
                overwriteRoutes: true
              }, { "external_id": replacingTransactionId, "status":"success" })
              cy.wait(5000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionId}`)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
                  cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                })
              })
            })
          })
        })
      })
    })

    it('detects replaced transaction via transaction state endpoint and fails it if replaced transaction failed', () => {
      let transaction = {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
      
      let mockedTransaction = mock({
        blockchain,
        transaction
      })

      fetchMock.post({
        url: "https://public.depay.fi/payments",
        body: {
          after_block: 1,
          amount: "20.0",
          blockchain: "ethereum",
          confirmations: 1,
          fee_amount: null,
          fee_receiver: null,
          nonce: 0,
          payload: {
            sender_amount: "20.0",
            sender_id: fromAddress.toLowerCase(),
            sender_token_id: DEPAY,
            type: 'payment'
          },
          receiver: toAddress,
          sender: fromAddress.toLowerCase(),
          token: DEPAY,
          transaction: mockedTransaction.transaction._id,
          uuid: mockedTransaction.transaction._id,
        },
      }, 201)

      cy.visit('cypress/test.html').then((contentWindow) => {
        cy.document().then((document)=>{
          DePayWidgets.Payment({ ...defaultArguments, document })
          cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click()
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'target').should('eq', '_blank')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').invoke('attr', 'rel').should('eq', 'noopener noreferrer')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying...').then(()=>{
            cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled')
            let replacingTransactionId = '0x782cf9983541087548c717dc1a4e2687ef8928e758316cd600ebb0652f57bafe'
            cy.wait(1000).then(()=>{
              fetchMock.get({
                url: `https://public.depay.fi/transactions/${blockchain}/${fromAddress.toLowerCase()}/0`,
                overwriteRoutes: true
              }, { "external_id": replacingTransactionId, "status":"failed" })
              cy.wait(5000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('a', 'View on explorer').invoke('attr', 'href').should('include', `https://etherscan.io/tx/${replacingTransactionId}`)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('h1').should('contain.text', 'Payment Failed')
                cy.get('button[title="Go back"]', { includeShadowDom: true }).should('exist')
                cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Try again').click()
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
              })
            })
          })
        })
      })
    })
  })
})
