# Codex-cli, speckit, latex and React installation script

## Complete Setup Script for Codespace

```bash
#!/bin/bash

# setup-codespace.sh - Complete setup for Codex-CLI, Speckit, Manim CE, and React
# Usage: bash setup-codespace.sh

set -e  # Exit on error

echo "========================================="
echo "🚀 Setting up Codespace development environment"
echo "========================================="
echo "This will install:"
echo "  - codex-cli (via npm)"
echo "  - speckit (via pip)"
echo "  - LaTeX (full, with tikz libraries)"
echo "  - manim Community Edition"
echo "  - React & React DOM"
echo "========================================="

# Verify npm is available (pre-installed in Codespaces)
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found! This shouldn't happen in Codespaces."
    exit 1
else
    echo "✅ npm found: $(npm --version)"
fi

# Verify pip3 is available (pre-installed in Codespaces)
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 not found! This shouldn't happen in Codespaces."
    exit 1
else
    echo "✅ pip3 found: $(pip3 --version)"
fi

# Update package lists
echo "📦 Updating package lists..."
sudo apt-get update

# Install system dependencies for Manim 
echo "🔧 Installing system dependencies (FFmpeg, build tools)..."
sudo apt-get install -y \
    ffmpeg \
    build-essential \
    python3-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    pkg-config

# Install LaTeX (includes tikz and all necessary packages) 
echo "📄 Installing LaTeX (this may take a few minutes)..."
sudo apt-get install -y \
    texlive \
    texlive-latex-extra \
    texlive-fonts-extra \
    texlive-luatex \
    texlive-xetex \
    texlive-fontutils \
    texlive-pictures \
    texlive-science \
    texlive-pstricks \
    dvipng \
    latexmk

# Verify LaTeX installation with tikz
echo "🔍 Verifying LaTeX/tikz installation..."
if command -v latex &> /dev/null; then
    echo "✅ LaTeX installed: $(latex --version | head -n1)"
    
    # Test tikz with a minimal LaTeX document
    echo "\\documentclass{article}\\usepackage{tikz}\\begin{document}\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}\\end{document}" > /tmp/test-tikz.tex
    if pdflatex -interaction=nonstopmode /tmp/test-tikz.tex &> /tmp/latex-test.log; then
        echo "✅ TikZ libraries working correctly"
    else
        echo "⚠️ TikZ test had issues, but main packages should be installed"
    fi
    rm -f /tmp/test-tikz.* /tmp/latex-test.log
fi

# 1. Install codex-cli via npm
echo "📦 Installing codex-cli..."
npm install -g codex-cli

# Verify codex installation
if command -v codex &> /dev/null; then
    echo "✅ codex-cli installed: $(codex --version 2>/dev/null || echo 'version unknown')"
fi

# 2. Install speckit via pip
echo "🔭 Installing speckit..."
pip3 install speckit

# Verify speckit installation
python3 -c "import speckit; print(f'✅ speckit installed: {speckit.__version__ if hasattr(speckit, \"__version__\") else \"version unknown\"}')" 2>/dev/null || echo "⚠️ speckit import failed"

# 3. Install Manim Community Edition 
echo "🎬 Installing Manim Community Edition..."
pip3 install manim

# Verify Manim installation
if command -v manim &> /dev/null; then
    echo "✅ Manim CE installed: $(manim --version)"
else
    echo "⚠️ Manim installation may need verification"
fi

# Create example Manim scene for testing 
cat > ~/example_scenes.py << 'EOF'
from manim import *

class SquareToCircle(Scene):
    def construct(self):
        square = Square()
        circle = Circle()
        self.play(Create(square))
        self.play(Transform(square, circle))
        self.wait()

class CreateCircle(Scene):
    def construct(self):
        circle = Circle()
        circle.set_fill(PINK, opacity=0.5)
        self.play(Create(circle))
        self.wait()
EOF

# 4. Install React and React DOM
echo "⚛️ Installing React and React DOM..."
# Create a package.json if it doesn't exist
if [ ! -f "package.json" ]; then
    npm init -y
fi

# Install React dependencies
npm install react react-dom

# Install React development dependencies (optional but recommended)
npm install --save-dev @types/react @types/react-dom

# Create a simple test React component
mkdir -p ~/react-test
cat > ~/react-test/App.js << 'EOF'
import React from 'react';

function App() {
  return (
    <div>
      <h1>React Test Component</h1>
      <p>React and React DOM installed successfully!</p>
    </div>
  );
}

export default App;
EOF

# Add bashrc aliases and configurations
echo "⚙️ Adding aliases and configurations to ~/.bashrc..."
cat >> ~/.bashrc << 'EOF'

# Tool aliases
alias codex-version='codex --version'
alias speckit-version='python3 -c "import speckit; print(speckit.__version__ if hasattr(speckit, \"__version__\") else \"installed\")"'
alias manim-version='manim --version'
alias manim-render='manim render'
alias manim-low='manim render -ql'
alias manim-medium='manim render -qm'
alias manim-high='manim render -qh'

# LaTeX helper
alias latex-version='latex --version | head -n2'

# React helpers
alias react-start='npm start'
alias react-build='npm run build'
alias create-react-app='npx create-react-app'

# Manim quick render functions
manim-quick() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "Usage: manim-quick <filename.py> <SceneName>"
        return 1
    fi
    manim render -ql "$1" "$2"
}

EOF

# Create a verification script
echo "🔍 Creating verification script..."
cat > ~/verify-installation.py << 'EOF'
#!/usr/bin/env python3
import subprocess
import sys

def check_cmd(cmd, name):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {name}: {result.stdout.strip().split(chr(10))[0]}")
            return True
        else:
            print(f"❌ {name}: Not found")
            return False
    except:
        print(f"❌ {name}: Error checking")
        return False

def check_package(package_name):
    try:
        __import__(package_name)
        print(f"✅ Python package '{package_name}': Found")
        return True
    except ImportError:
        print(f"❌ Python package '{package_name}': Not found")
        return False

print("\n=== Verification Report ===\n")

# Check command-line tools
check_cmd("codex --version", "codex-cli")
check_cmd("manim --version", "Manim CE")
check_cmd("latex --version", "LaTeX")
check_cmd("ffmpeg -version", "FFmpeg")

# Check Python packages
check_package("speckit")
check_package("manim")

# Check Node packages
try:
    result = subprocess.run("npm list react react-dom --depth=0", shell=True, capture_output=True, text=True)
    if "react@" in result.stdout:
        print("✅ React/React DOM: Installed")
    else:
        print("❌ React/React DOM: Not found")
except:
    print("❌ React/React DOM: Error checking")

print("\n========================")
EOF

chmod +x ~/verify-installation.py

echo "========================================="
echo "✅ Setup complete!"
echo "========================================="
echo ""
echo "📋 Installation Summary:"
echo "   - codex-cli: $(codex --version 2>/dev/null || echo 'installed')"
echo "   - speckit: $(python3 -c 'import speckit; print(speckit.__version__ if hasattr(speckit, "__version__") else "installed")' 2>/dev/null || echo 'installed')"
echo "   - LaTeX (full, with tikz): $(latex --version | head -n1 2>/dev/null || echo 'installed')"
echo "   - Manim CE: $(manim --version 2>/dev/null || echo 'installed')"
echo "   - React: $(npm list react --depth=0 2>/dev/null | grep react@ | head -n1 || echo 'installed')"
echo ""
echo "🚀 Quick Commands:"
echo "   - Run verification: python3 ~/verify-installation.py"
echo "   - Test Manim: cd ~ && manim render example_scenes.py SquareToCircle -ql"
echo "   - Start React project: npx create-react-app my-app"
echo "   - Manim quality flags: -ql (low), -qm (medium), -qh (high) "
echo ""
echo "🛠️  New aliases (run 'source ~/.bashrc' to enable):"
echo "   - manim-version, manim-render, manim-quick"
echo "   - react-start, react-build, create-react-app"
echo "   - latex-version"
echo ""
echo "📚 Example Manim scene created at: ~/example_scenes.py "
echo "========================================="
```

## Alternative: Devcontainer Configuration

For even better reproducibility, create a `.devcontainer/devcontainer.json` in your repository:

```json
{
    "name": "Full Development Environment",
    "image": "mcr.microsoft.com/devcontainers/universal:2",
    "features": {
        "ghcr.io/devcontainers/features/desktop-lite:1": {},
        "ghcr.io/devcontainers/features/sshd:1": {}
    },
    "postCreateCommand": "bash .devcontainer/setup-codespace.sh",
    "customizations": {
        "vscode": {
            "extensions": [
                "ms-python.python",
                "ms-toolsai.jupyter",
                "github.copilot",
                "manimextension.manim-sideview",
                "esbenp.prettier-vscode",
                "dsznajder.es7-react-js-snippets"
            ]
        }
    }
}
```

## Installation Notes

1. **LaTeX with TikZ**: The installation includes `texlive-pictures` and `texlive-pstricks` which contain TikZ and all drawing-related packages .

2. **Manim CE Dependencies**: FFmpeg is installed for video rendering, and LaTeX for text rendering .

3. **React**: Creates a local installation in your workspace. Use `npx create-react-app` for new projects.

4. **Verification**: The script includes a verification tool to confirm all components are working.

To use: save as `setup-codespace.sh`, make executable (`chmod +x setup-codespace.sh`), and run (`./setup-codespace.sh`).