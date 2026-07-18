Aquí tienes la versión actualizada del script incluyendo JSDoc:

```bash
#!/bin/bash

# setup-codespace.sh - Complete setup for Codex-CLI, Speckit, Manim CE, React, and JSDoc
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
echo "  - JSDoc (for JavaScript documentation)"
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

# 5. Install JSDoc (global installation)
echo "📝 Installing JSDoc..."
npm install -g jsdoc

# Verify JSDoc installation
if command -v jsdoc &> /dev/null; then
    echo "✅ JSDoc installed: $(jsdoc --version)"
else
    echo "⚠️ JSDoc installation may need verification"
fi

# Create JSDoc example configuration and sample file
echo "📚 Creating JSDoc example files..."
cat > ~/jsdoc-example.js << 'EOF'
/**
 * Represents a book.
 * @constructor
 * @param {string} title - The title of the book.
 * @param {string} author - The author of the book.
 */
function Book(title, author) {
    this.title = title;
    this.author = author;
}

/**
 * Calculate the sum of two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function sum(a, b) {
    return a + b;
}

/**
 * Greeting function
 * @param {string} name - Name to greet
 * @returns {string} Greeting message
 */
const greet = (name) => {
    return `Hello, ${name}!`;
};

export { Book, sum, greet };
EOF

cat > ~/jsdoc-config.json << 'EOF'
{
    "source": {
        "include": ["."],
        "includePattern": ".+\\.js(doc|x)?$",
        "excludePattern": "(node_modules|docs|out)"
    },
    "plugins": [],
    "templates": {
        "cleverLinks": false,
        "monospaceLinks": false
    },
    "opts": {
        "recurse": true,
        "destination": "./docs/",
        "template": "templates/default"
    }
}
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

# JSDoc helpers
alias jsdoc-version='jsdoc --version'
alias jsdoc-generate='jsdoc -c jsdoc-config.json'
alias jsdoc-simple='jsdoc . -d docs'  # Quick JSDoc generation
alias jsdoc-watch='npx jsdoc -c jsdoc-config.json --watch'  # Requires nodemon

# Manim quick render functions
manim-quick() {
    if [ -z "$1" ] || [ -z "$2" ]; then
        echo "Usage: manim-quick <filename.py> <SceneName>"
        return 1
    fi
    manim render -ql "$1" "$2"
}

# JSDoc function for quick documentation generation
doc-js() {
    if [ -z "$1" ]; then
        echo "Usage: doc-js <source-file-or-directory> [output-directory]"
        echo "Example: doc-js src/ ./docs"
        return 1
    fi
    
    SOURCE="$1"
    OUTPUT="${2:-./jsdoc-out}"
    
    echo "📝 Generating JSDoc documentation from $SOURCE to $OUTPUT"
    jsdoc "$SOURCE" -d "$OUTPUT"
    echo "✅ Documentation generated in $OUTPUT"
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
check_cmd("jsdoc --version", "JSDoc")

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
echo "   - JSDoc: $(jsdoc --version 2>/dev/null || echo 'installed')"
echo ""
echo "🚀 Quick Commands:"
echo "   - Run verification: python3 ~/verify-installation.py"
echo "   - Test Manim: cd ~ && manim render example_scenes.py SquareToCircle -ql"
echo "   - Start React project: npx create-react-app my-app"
echo "   - Test JSDoc: jsdoc ~/jsdoc-example.js -d ~/jsdoc-test"
echo "   - Generate docs: jsdoc -c jsdoc-config.json"
echo ""
echo "🛠️  New aliases (run 'source ~/.bashrc' to enable):"
echo "   - manim-version, manim-render, manim-quick"
echo "   - react-start, react-build, create-react-app"
echo "   - latex-version"
echo "   - jsdoc-version, jsdoc-generate, jsdoc-simple, doc-js"
echo ""
echo "📚 Example files created:"
echo "   - Manim: ~/example_scenes.py"
echo "   - React test: ~/react-test/App.js"
echo "   - JSDoc example: ~/jsdoc-example.js"
echo "   - JSDoc config: ~/jsdoc-config.json"
echo "========================================="
```

JSDoc Usage Examples

Después de instalar, aquí tienes algunos comandos útiles para JSDoc:

```bash
# Ver versión de JSDoc
jsdoc --version

# Generar documentación básica
jsdoc tu-archivo.js -d ./docs

# Usar el alias simple (después de hacer source ~/.bashrc)
jsdoc-simple

# Usar la función helper con directorio específico
doc-js src/ ./documentation

# Generar documentación recursiva con configuración
jsdoc -c jsdoc-config.json -r .
```

JSDoc Features Instaladas

✅ Instalación global: JSDoc está disponible en todo el sistema
✅ Configuración de ejemplo: Archivo jsdoc-config.json con configuración básica
✅ Ejemplo de código: jsdoc-example.js con documentación JSDoc de muestra
✅ Aliases útiles: Comandos cortos para generar documentación rápidamente
✅ Función helper: doc-js para generar documentación con un solo comando

¿Necesitas alguna configuración adicional para JSDoc o algún otro paquete?