// menu.js
const menuHTML = `
<aside class="sidebar">
    <header>
        <img src="imgs/logo.png" alt="Logo Animamochi" width="280" height="167" class="logo-sidebar">
        
        <h1>Técnicas de Animação<br>Frame a Frame</h1>
        <p class="subtitle">Notas de produção e estudos</p>
    </header>
    
    <nav>
        <ul>
            <li><a href="index.html" class="nav-link">Início</a></li>
            <li><a href="tsuke.html" class="nav-link">Follow Pan/ Tsuke Pan no Clip Studio Paint</a></li>
            <li><a href="00.html" class="nav-link">Animação em 3 Pontos com Tsuke Pan</a></li>
            
        </ul>
    </nav>

    <footer>
        <p>&copy; 2026 Animamochi</p>
    </footer>
</aside>
`;

// Injeta o menu na página
document.getElementById("sidebar-container").innerHTML = menuHTML;

// Destaca o link da página atual (deixa negrito)
const currentFile = window.location.pathname.split("/").pop() || "index.html";
const links = document.querySelectorAll('.nav-link');

links.forEach(link => {
    if (link.getAttribute('href') === currentFile) {
        link.classList.add('active'); // Você precisa ter um estilo .active no CSS
    }
});
