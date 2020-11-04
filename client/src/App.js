import React from 'react';

import './App.css';

function ChainlinkSelect(props) {
    let options = props.state.priceData.map(data => 
        <option value={data.asset}>{data.asset}</option>
    );

    return (
      <>
        <label>
          Trigger
          <select onChange={props.handler.handleChainlinkPriceChange}>
            <option value="above">Above</option>    
            <option value="below">Below</option>    
          </select>
        </label>
        <br />
        <label>
          Asset
          <select onChange={props.handler.handleChainlinkAssetChange}>
            {options}
          </select>
        </label>
        <br />
        <label>
          Price
          <input type="number"/>
        </label>
      </>
    );
}

function UniswapSelect(props) {
    let options = props.state.allPairs.map(pair =>
      <option value={pair}>{pair}</option>
    );

    return (
        <>
          <label>
            Pair
            <select onChange={props.handler.handlePairChange}>
              {options}
            </select>
          </label>
          <br />
          <label>
            Price
            <input type="number" />
          </label>
        </>
    );
}

function DomainSelect(props) {
   let domain = props.state.domain;

   if (domain === 'uniswap') {
       return (
           <UniswapSelect state={props.state} handler={props.handler}/>
       );
   } else if (domain === 'chainlink') {
       return (
           <ChainlinkSelect state={props.state} handler={props.handler}/>
       );
   } else {
       return (<p>Select a domain</p>);
   }
};

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      domain: 'uniswap',
      allPairs: [],
      selectedPair: '',
      priceLevel: ''
    };

    this.handleDomainChange = this.handleDomainChange.bind(this);
    this.handlePairChange = this.handlePairChange.bind(this);
    this.handlePriceChange = this.handlePriceChange.bind(this);
    this.handleChainlinkPriceChange = this.handleChainlinkPriceChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  componentDidMount() {
    fetch('/api/pairReserves')
      .then(res => res.json())
      .then(json => {
        this.data = json;

        this.setState({
            allPairs: this.data.map(d => d.name),
            selectedPair: this.data[0].name,
            priceLevel: this.data[0].reserve0
        });
      });

    fetch('/api/prices')
      .then(res => res.json())
      .then(json => {
        this.priceData = json;

        this.setState({
            priceData: this.priceData,
        });
      });
  }

  handleDomainChange(event) {
    this.setState({
        domain: event.target.value
    }); 
  }

  handlePairChange(event) {
    this.setState({
        selectedPair: event.target.value,
        priceLevel: this.data.find(d => d.name === event.target.value).reserve0
    });
  }

  handlePriceChange(event) {
    console.log(event);
    this.setState({
      priceLevel: event.target.value
    });
  }

  handleChainlinkAssetChange(event) {
    this.setState({
      
    });
  }

  handleChainlinkPriceChange(event) {
    console.log(event);
  }

  handleSubmit(event) {
    alert('A name was submitted: ' + this.state.value);
    event.preventDefault();
  }

  render() { 
    return (
        <div className="App">
          <header className="App-header">
              <form onSubmit={this.handleSubmit}>
                <label>
                  Domain
                  <select onChange={this.handleDomainChange} >
                    <option value="uniswap">Uniswap</option>
                    <option value="chainlink"> Chainlink</option>
                  </select> 
                </label>
                <br />
                <DomainSelect state={this.state} handler={this} />
                <br />
                <label>
                  Submit
                  <input type="submit" />
                </label>
              </form>
          </header>
        </div>
      );
  }
}

export default App;
