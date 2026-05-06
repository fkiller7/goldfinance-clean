import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./components/Dashboard";
import Farms from "./components/Farms";
import Boardroom from "./components/Boardroom";
import GoldShareFarm from "./components/GoldShareFarm";
import GoldCoinFarm from "./components/GoldCoinFarm";
import GoldGshareFarm from "./components/GoldGshareFarm";
import NFT from "./components/NFT";

import "./index.css";

export default function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/farms" element={<Farms />} />
            <Route path="/boardroom" element={<Boardroom />} />
            <Route path="/nft" element={<NFT />} />

            {/* Individuele farm detail pages */}
            <Route path="/farms/goldshare-bnb" element={<GoldShareFarm />} />
            <Route path="/farms/goldcoin-bnb" element={<GoldCoinFarm />} />
            <Route path="/farms/goldcoin-goldshare" element={<GoldGshareFarm />} />

            {/* Fallback */}
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}
