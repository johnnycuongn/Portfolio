const NavBarAClassName = "text-white rounded  pointer-events-auto p-2";

function PortfolioNavBar() {
  return <nav className="fixed top-0 right-0 flex flex-row justify-end p-2 gap-2 z-100">
      <a className={NavBarAClassName}>Home</a>
      <a className={NavBarAClassName}>Projects</a>
      <a className={NavBarAClassName}>Resume</a>
      <a className={NavBarAClassName}>Contact</a>
  </nav>
}

export { PortfolioNavBar };