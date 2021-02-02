import AmountContext from '../contexts/AmountContext';
import React from 'react';
import {ethers} from 'ethers';

class AmountProvider extends React.Component {
  state = {
    amount: null
  };

  constructor(props) {
    super(props);
    Object.assign(this.state, {
      token: props.token,
      amount: props.amount
    })
  }

  componentDidUpdate(prevProps) {
    if(prevProps.token != this.props.token) {
      this.setState({
        token: this.props.token
      })
    }
  }

  change(amount) {
    this.setState({
      amount: amount.toLocaleString('fullwide', {useGrouping:false})
    })
  }

  convertedStateAmount() {
    if(this.state.token) {
      return ethers.utils.parseUnits(this.state.amount.toString(), this.state.token.decimals).toString()
    } else {
      return this.state.amount;
    }
  }

  render() {
    return(
      <AmountContext.Provider value={{
        amount: this.convertedStateAmount(),
        change: this.change.bind(this)
      }}>
        {this.props.children}
      </AmountContext.Provider>
    )
  }
}

export default AmountProvider;
