import closeWidget from '../../../tests/helpers/closeWidget'
import DePayWidgets from '../../../src'
import fetchMock from 'fetch-mock'
import mockBasics from '../../../tests/mocks/basics'
import React from 'react'
import ReactDOM from 'react-dom'
import { CONSTANTS } from '@depay/web3-constants'
import { mock, confirm, increaseBlock, resetMocks } from '@depay/web3-mock'
import { resetCache, provider } from '@depay/web3-client'
import { routers, plugins } from '@depay/web3-payments'
import { Server } from 'mock-socket'
import { Token } from '@depay/web3-tokens'

describe('Payment Widget: track', () => {

  const blockchain = 'ethereum'
  const accounts = ['0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']
  beforeEach(resetMocks)
  beforeEach(resetCache)
  beforeEach(()=>fetchMock.restore())
  afterEach(()=>fetchMock.restore())
  beforeEach(()=>mock({ blockchain, accounts: { return: accounts } }))
  afterEach(closeWidget)

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
    }],
    track: {
      endpoint: '/track/payments'
    }
  }
  let mockedWebsocketServer = new Server('wss://integrate.depay.fi/cable')
  let websocketMessages = []
  let mockedWebsocket

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
  
  it('tracks payments and just closes the dialog if no forwardTo was defined', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let trackingRequestMock = fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true
    }, 200)

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
              expect(
                fetchMock.called('/track/payments', {
                  body: {
                    "blockchain": blockchain,
                    "sender": fromAddress.toLowerCase(),
                    "nonce": 0,
                    "after_block": 1,
                    "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
                  },
                  matchPartialBody: true
                })
              ).to.equal(true)
              confirm(mockedTransaction)
              cy.wait(1000).then(()=>{
                expect(!!websocketMessages.find((rawMessage)=>{
                  let message = JSON.parse(rawMessage)
                  return(
                    message.command == 'subscribe' &&
                    message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                  )
                })).to.equal(true)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Validating payment').find('.Loading')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                    mockedWebsocket.send(JSON.stringify({
                      message: {
                        release: true
                      }
                    }))
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').click().then(()=>{
                        cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('tracks payments asynchnously if configured that way', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let trackingRequestMock = fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true
    }, 200)

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, track: {
          endpoint: '/track/payments',
          async: true
        }, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
              expect(
                fetchMock.called('/track/payments', {
                  body: {
                    "blockchain": blockchain,
                    "sender": fromAddress.toLowerCase(),
                    "nonce": 0,
                    "after_block": 1,
                    "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
                  },
                  matchPartialBody: true
                })
              ).to.equal(true)
              confirm(mockedTransaction)
              cy.wait(1000).then(()=>{
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Validating payment').should('not.exist')
                })
              })
            })
          })
        })
      })
    })
  })

  it('tracks payments and forwards directly if forwardTo was specified by the backend end without allowing to close the widget', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let trackingRequestMock = fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true
    }, 200)

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
              expect(
                fetchMock.called('/track/payments', {
                  body: {
                    "blockchain": blockchain,
                    "sender": fromAddress.toLowerCase(),
                    "nonce": 0,
                    "after_block": 1,
                    "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
                  },
                  matchPartialBody: true
                })
              ).to.equal(true)
              confirm(mockedTransaction)
              cy.wait(1000).then(()=>{
                expect(!!websocketMessages.find((rawMessage)=>{
                  let message = JSON.parse(rawMessage)
                  return(
                    message.command == 'subscribe' &&
                    message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                  )
                })).to.equal(true)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Validating payment').find('.Loading')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                    mockedWebsocket.send(JSON.stringify({
                      identifier: JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' }),
                      message: {
                        release: true,
                        forward_to: '/somethingelse'
                      }
                    }))
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                      cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').invoke('attr', 'href').should('include', '/somethingelse')
                      cy.location('href').should('include', '/somethingelse')
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('confirms payment via tracking before rpc', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let trackingRequestMock = fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true
    }, 200)

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
              expect(
                fetchMock.called('/track/payments', {
                  body: {
                    "blockchain": blockchain,
                    "sender": fromAddress.toLowerCase(),
                    "nonce": 0,
                    "after_block": 1,
                    "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
                  },
                  matchPartialBody: true
                })
              ).to.equal(true)
              cy.wait(1000).then(()=>{
                mockedWebsocket.send(JSON.stringify({
                  message: {
                    release: true
                  }
                }))
                expect(!!websocketMessages.find((rawMessage)=>{
                  let message = JSON.parse(rawMessage)
                  return(
                    message.command == 'subscribe' &&
                    message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                  )
                })).to.equal(true)
                cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                  cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Continue').should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').click().then(()=>{
                    cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('tries tracking request up to 3 times', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let attempt = 1
    fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, ()=>{
      attempt += 1
      if(attempt <= 3) {
        return 502
      } else {
        return 200
      }
    })

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.wait(9000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
                expect(
                  fetchMock.calls().filter((call)=>{ return call[0] == '/track/payments' && call.response.status == 502 }).length
                ).to.equal(2)
                expect(
                  fetchMock.calls().filter((call)=>{ return call[0] == '/track/payments' && call.response.status == 200 }).length
                ).to.equal(1)

                confirm(mockedTransaction)
                cy.wait(1000).then(()=>{
                  expect(!!websocketMessages.find((rawMessage)=>{
                    let message = JSON.parse(rawMessage)
                    return(
                      message.command == 'subscribe' &&
                      message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                    )
                  })).to.equal(true)
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                    cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Validating payment').find('.Loading')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                      mockedWebsocket.send(JSON.stringify({
                        message: {
                          release: true
                        }
                      }))
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').click().then(()=>{
                          cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('fails tracking, shows warning and calls error callback if tracking request fails 3 times', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, ()=>{ return 502 })

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        let errorCallbackError
        DePayWidgets.Payment({ ...defaultArguments, document, error: (error)=>{
          errorCallbackError = error
        }})
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.wait(9000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
                confirm(mockedTransaction)
                cy.wait(1000).then(()=>{
                  expect(!!websocketMessages.find((rawMessage)=>{
                    let message = JSON.parse(rawMessage)
                    return(
                      message.command == 'subscribe' &&
                      message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                    )
                  })).to.equal(true)
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                    cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Tracking payment failed!').then(()=>{
                        expect(errorCallbackError.code).to.equal("TRACKING_FAILED")
                        mockedWebsocket.send(JSON.stringify({
                          message: {
                            release: true
                          }
                        }))
                        cy.wait(1000)
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('tries tracking request up to 3 times', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    let attempt = 1
    fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      headers: {
        'x-custom-header': '1'
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, (request, second)=>{
      attempt += 1
      if(attempt <= 3) {
        return 502
      } else {
        return 200
      }
    })

    mockedWebsocketServer.on('connection', socket => {
      mockedWebsocket = socket
      mockedWebsocket.on('message', data => {
        websocketMessages.push(data)
      })
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        DePayWidgets.Payment({ ...defaultArguments, document, track: {
          method: (payment)=>{
            return fetch('/track/payments', {
              method: 'POST',
              body: JSON.stringify(payment),
              headers: { "Content-Type": "application/json", "x-custom-header": "1" }
            })
          }
        }})
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.wait(9000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
                expect(
                  fetchMock.calls().filter((call)=>{ return call[0] == '/track/payments' && call.response.status == 502 }).length
                ).to.equal(2)
                expect(
                  fetchMock.calls().filter((call)=>{ return call[0] == '/track/payments' && call.response.status == 200 }).length
                ).to.equal(1)

                confirm(mockedTransaction)
                cy.wait(1000).then(()=>{
                  expect(!!websocketMessages.find((rawMessage)=>{
                    let message = JSON.parse(rawMessage)
                    return(
                      message.command == 'subscribe' &&
                      message.identifier == JSON.stringify({ blockchain, sender: fromAddress.toLowerCase(), nonce: 0, channel: 'PaymentChannel' })
                    )
                  })).to.equal(true)
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                    cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Validating payment').find('.Loading')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                      mockedWebsocket.send(JSON.stringify({
                        message: {
                          release: true
                        }
                      }))
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').click().then(()=>{
                          cy.get('.ReactShadowDOMOutsideContainer').should('not.exist')
                        })
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('allows to configure additional polling endpoint to retrieve payment status in case socket communication fails', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, 200)

    let attempt = 0
    fetchMock.post({
      url: "/payments/status",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, ()=>{
      attempt += 1
      if(attempt <= 2) {
        return 404
      } else {
        return {
          forward_to: '/somethingelse'
        }
      }
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        let errorCallbackError
        DePayWidgets.Payment({ ...defaultArguments, document,
          track: {
            endpoint: '/track/payments',
            poll: {
              endpoint: '/payments/status'
            }
          }
        })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.wait(9000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
                confirm(mockedTransaction)
                cy.wait(1000).then(()=>{
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                    cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').invoke('attr', 'href').should('include', '/somethingelse')
                        cy.location('href').should('include', '/somethingelse')
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })

  it('allows to configure additional polling method to retrieve payment status in case socket communication fails', () => {
    let mockedTransaction = mock({
      blockchain,
      transaction: {
        from: fromAddress,
        to: DEPAY,
        api: Token[blockchain].DEFAULT,
        method: 'transfer',
        params: [toAddress, TOKEN_A_AmountBN]
      }
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

    fetchMock.post({
      url: "/track/payments",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, 200)

    let attempt = 0
    fetchMock.post({
      url: "/payments/status",
      body: {
        "blockchain": blockchain,
        "sender": fromAddress.toLowerCase(),
        "nonce": 0,
        "after_block": 1,
        "to_token": "0xa0bEd124a09ac2Bd941b10349d8d224fe3c955eb"
      },
      headers: {
        'x-custom-header': '1'
      },
      matchPartialBody: true,
      overwriteRoutes: false
    }, ()=>{
      attempt += 1
      if(attempt <= 2) {
        return 404
      } else {
        return {
          forward_to: '/somethingelse'
        }
      }
    })

    cy.visit('cypress/test.html').then((contentWindow) => {
      cy.document().then((document)=>{
        let errorCallbackError
        DePayWidgets.Payment({ ...defaultArguments, document,
          track: {
            endpoint: '/track/payments',
            poll: {
              method: (payment)=>{
                return fetch('/payments/status', {
                  method: 'POST',
                  body: JSON.stringify(payment),
                  headers: { "Content-Type": "application/json", "x-custom-header": "1" }
                })
              }
            }
          }
        })
        cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('exist')
        cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').then(()=>{
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Pay €28.05')
          cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').click().then(()=>{
            cy.wait(9000).then(()=>{
              cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.ButtonPrimary').should('contain.text', 'Paying').then(()=>{
                confirm(mockedTransaction)
                cy.wait(1000).then(()=>{
                  cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card.disabled').then(()=>{
                    cy.get('button[title="Close dialog"]', { includeShadowDom: true }).should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary', 'Close').should('not.exist')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().find('.Card .Checkmark')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment confirmed').invoke('attr', 'href').should('include', 'https://etherscan.io/tx/')
                    cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary.disabled', 'Continue').should('exist').then(()=>{
                      cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').then(()=>{
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.Card', 'Payment validated').find('.Checkmark')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').should('exist')
                        cy.get('.ReactShadowDOMOutsideContainer').shadow().contains('.ButtonPrimary:not(.disabled)', 'Continue').invoke('attr', 'href').should('include', '/somethingelse')
                        cy.location('href').should('include', '/somethingelse')
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})
