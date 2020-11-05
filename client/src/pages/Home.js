import React from 'react';

import { Table } from 'react-bootstrap';

function UniswapPairTable(props) {
    let data = props.data;

    if (data === undefined) {
        data = [];
    }

    console.log(data);

    let rows = data.map(d =>
        <tr>
          <td>{d.name}</td>
          <td>{d.reserve0}</td>
          <td>{d.reserve1}</td>
        </tr>
    );

    return (
      <Table striped bordered hover>
        <thead>
          <th>Pair</th>
          <th>Reserve0</th>
          <th>Reserve1</th>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </Table>
    );
}

function ChainlinkTable(props) {
    let data = props.data;

    if (data === undefined) {
        data = [];
    }

    console.log(data);

    let rows = data.map(d =>
        <tr>
          <td>{d.asset}</td>
          <td>{d.answer}</td>
        </tr>
    );

    return (
      <Table striped bordered hover>
        <thead>
          <th>Asset</th>
          <th>Price</th>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </Table>
    );
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
        
    };
  }

  componentDidMount() {
    fetch('/api/pairReserves')
      .then(res => res.json())
      .then(json => {
        this.setState({
            pairData: json
        });
      });

    fetch('/api/prices')
      .then(res => res.json())
      .then(json => {
        this.setState({
            priceData: json,
        });
      });
  }

  render() { 
    return (
        <div>
          <UniswapPairTable data={this.state.pairData} />
          <ChainlinkTable data={this.state.priceData} />
        </div>
      );
  }
}

export default App;
