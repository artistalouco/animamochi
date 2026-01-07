const gridContainer = document.getElementById('hex-grid');
const modal = document.getElementById('token-modal');
const rows = 8; // Quantidade de linhas
const cols = 7; // Quantidade de colunas (ajuste no CSS também se mudar muito)

// Estado da aplicação
let mapData = {}; 
let selectedHexId = null;
let movingTokenId = null;

// Inicialização
function init() {
    loadFromStorage();
    renderGrid();
}

// 1. Renderiza o Grid
function renderGrid() {
    gridContainer.innerHTML = '';
    
    // Cria X hexágonos
    for (let i = 0; i < (rows * cols); i++) {
        const hex = document.createElement('div');
        hex.classList.add('hex');
        hex.dataset.id = i;
        hex.onclick = () => handleHexClick(i);

        // Se houver token salvo neste ID
        if (mapData[i]) {
            renderToken(hex, mapData[i]);
        }

        gridContainer.appendChild(hex);
    }
}

// 2. Renderiza um Token dentro do Hex
function renderToken(hexElement, data) {
    const tokenDiv = document.createElement('div');
    tokenDiv.classList.add('token');
    
    // Se tiver imagem, usa, senão usa uma cor padrão
    if (data.image) {
        tokenDiv.style.backgroundImage = `url('${data.image}')`;
    } else {
        tokenDiv.style.backgroundColor = '#e74c3c';
    }

    // Adiciona a condição (status)
    if (data.condition) {
        const conditionSpan = document.createElement('span');
        conditionSpan.classList.add('token-condition');
        conditionSpan.innerText = data.condition;
        tokenDiv.appendChild(conditionSpan);
    }

    hexElement.appendChild(tokenDiv);
}

// 3. Lógica do Clique (Mover ou Editar)
function handleHexClick(id) {
    const hasToken = !!mapData[id];

    // MODO DE MOVIMENTO
    if (movingTokenId !== null) {
        if (id === movingTokenId) {
            // Clicou no mesmo lugar: cancela movimento e abre edição
            movingTokenId = null;
            openModal(id);
            renderGrid(); // Remove destaque
            return;
        }

        // Move o token para o novo hexágono
        mapData[id] = mapData[movingTokenId]; // Copia dados
        delete mapData[movingTokenId];        // Apaga do antigo
        movingTokenId = null;
        saveToStorage();
        renderGrid();
        return;
    }

    // MODO DE SELEÇÃO / EDIÇÃO
    if (hasToken) {
        // Primeiro clique: Seleciona para mover
        movingTokenId = id;
        // Destaque visual
        document.querySelectorAll('.hex').forEach(h => h.classList.remove('selected'));
        const hexEl = document.querySelector(`.hex[data-id="${id}"]`);
        if(hexEl) hexEl.classList.add('selected');
    } else {
        // Clicou num vazio: Adicionar novo
        openModal(id);
    }
}

// 4. Funções do Modal
function openModal(id) {
    selectedHexId = id;
    const data = mapData[id] || { image: '', condition: '' };
    
    document.getElementById('selected-hex-id').value = id;
    document.getElementById('token-img').value = data.image;
    document.getElementById('token-condition').value = data.condition;
    
    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
    movingTokenId = null;
    renderGrid();
}

function saveToken() {
    const id = document.getElementById('selected-hex-id').value;
    const img = document.getElementById('token-img').value;
    const cond = document.getElementById('token-condition').value;

    if (!img && !cond) {
        alert("Preencha pelo menos a imagem ou a condição");
        return;
    }

    mapData[id] = { image: img, condition: cond };
    saveToStorage();
    closeModal();
    renderGrid();
}

function deleteToken() {
    const id = document.getElementById('selected-hex-id').value;
    if (mapData[id]) {
        delete mapData[id];
        saveToStorage();
    }
    closeModal();
    renderGrid();
}

// 5. Persistência (LocalStorage e JSON)
function saveToStorage() {
    localStorage.setItem('rpgMapData', JSON.stringify(mapData));
}

function loadFromStorage() {
    const data = localStorage.getItem('rpgMapData');
    if (data) mapData = JSON.parse(data);
}

function clearMap() {
    if(confirm('Tem certeza? Isso apagará tudo.')) {
        mapData = {};
        saveToStorage();
        renderGrid();
    }
}

// Gambiarra para "Multiplayer Offline": Exportar/Importar Save
function exportMap() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mapa_rpg.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importMap() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => { 
        const file = e.target.files[0]; 
        const reader = new FileReader();
        reader.readAsText(file,'UTF-8');
        reader.onload = readerEvent => {
            const content = readerEvent.target.result;
            mapData = JSON.parse(content);
            saveToStorage();
            renderGrid();
        }
    }
    input.click();
}

// Iniciar
init();
