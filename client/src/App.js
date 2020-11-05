import React from 'react';
import { Navbar, Nav } from 'react-bootstrap';

import Main from './main.js';

const NavComponent = () => {
    return (
      <Navbar bg="dark" variant="dark">
        <Navbar.Brand href="#home">Navbar</Navbar.Brand>
        <Nav className="mr-auto">
          <Nav.Link href="/">Home</Nav.Link>
          <Nav.Link href="/">Account</Nav.Link>
        </Nav>
      </Navbar>
    );
}

function App() {
  return (
    <div className="App">
      <NavComponent />
      <Main />
    </div>
  );
}

export default App;
