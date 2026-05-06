import React from "react";
import { Twitter, Send, MessageSquare, Github } from "lucide-react";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-logo">Gold Finance</div>

        <div className="socials">
          <a href="https://x.com" target="_blank" rel="noopener noreferrer">
            <Twitter size={20} />
          </a>
          <a href="https://t.me" target="_blank" rel="noopener noreferrer">
            <Send size={20} />
          </a>
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
            <MessageSquare size={20} />
          </a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            <Github size={20} />
          </a>
        </div>

        <p className="copyright">© 2025 Gold Finance. All rights reserved.</p>
      </div>
    </footer>
  );
}
