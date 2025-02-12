const NavBarAClassName = "text-white hover:text-gray-300 pointer-events-auto px-4 py-2";

function PortfolioNavBar() {
  return <nav className="flex flex-row justify-end bg-blue-400">
      <a className={NavBarAClassName}>Home</a>
      <a className={NavBarAClassName}>Projects</a>
      <a className={NavBarAClassName}>Resume</a>
      <a className={NavBarAClassName}>Contact</a>
  </nav>
}

export { PortfolioNavBar };