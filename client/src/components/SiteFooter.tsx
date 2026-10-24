import { Link } from "react-router-dom";
import Logo from "./Logo";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-row">
          <div>
            <Logo />
            <p className="tag">Brands meet creators. Deals get done.</p>
          </div>
          <ul>
            <li>
              <a href="mailto:dealdonehai@gmail.com">dealdonehai@gmail.com</a>
            </li>
            <li>
              <Link to="/terms">Terms</Link>
            </li>
            <li>
              <Link to="/privacy">Privacy</Link>
            </li>
          </ul>
        </div>
        <div className="footer-base">© 2026 DealDoneHai · Bengaluru, India</div>
      </div>
    </footer>
  );
}
