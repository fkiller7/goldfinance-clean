import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import ConnectButton from "./ConnectButton";

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <header className="gf-nav">
      <div className="gf-nav__brand">Gold Finance</div>

      <nav className="gf-tabs" aria-label="Main">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            "gf-tab" + (isActive || pathname === "/" ? " gf-tab--active" : "")
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/farms"
          className={({ isActive }) => "gf-tab" + (isActive ? " gf-tab--active" : "")}
        >
          Farms
        </NavLink>

        <NavLink
          to="/boardroom"
          className={({ isActive }) => "gf-tab" + (isActive ? " gf-tab--active" : "")}
        >
          Boardroom
        </NavLink>

        <NavLink
          to="/nft"
          className={({ isActive }) => "gf-tab" + (isActive ? " gf-tab--active" : "")}
        >
          NFT
        </NavLink>
      </nav>

      <div className="gf-nav__cta">
        <ConnectButton />
      </div>
    </header>
  );
}
