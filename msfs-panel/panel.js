/**
 * MSFS ATC Panel — WebSocket client
 * Connects to the Electron app via ws://localhost:8766
 */
(function () {
    const phaseEl = document.getElementById('phase');
    const frequencyEl = document.getElementById('frequency');
    const messagesEl = document.getElementById('messages');
    const connectionDot = document.getElementById('connectionDot');
    const connectionText = document.getElementById('connectionText');
    const pttStatus = document.getElementById('pttStatus');

    let ws = null;
    const MAX_MESSAGES = 3;

    function connect() {
        ws = new WebSocket('ws://localhost:8766');

        ws.onopen = () => {
            connectionDot.classList.add('connected');
            connectionText.textContent = 'ATC App';
            messagesEl.innerHTML = '';
        };

        ws.onclose = () => {
            connectionDot.classList.remove('connected');
            connectionText.textContent = 'Disconnected';
            setTimeout(connect, 3000);
        };

        ws.onerror = () => {
            ws.close();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (e) {
                console.error('[Panel] Parse error:', e);
            }
        };
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'phase':
                phaseEl.textContent = data.phase || 'ATIS';
                if (data.frequency) frequencyEl.textContent = data.frequency;
                break;

            case 'atc':
                addMessage('atc', data.text, data.controller);
                break;

            case 'pilot':
                addMessage('pilot', data.text);
                break;

            case 'ptt':
                if (data.active) {
                    pttStatus.classList.add('active');
                    pttStatus.textContent = 'PTT: TRANSMITTING';
                } else {
                    pttStatus.classList.remove('active');
                    pttStatus.textContent = 'PTT: IDLE';
                }
                break;

            case 'frequency':
                frequencyEl.textContent = data.frequency;
                break;
        }
    }

    function addMessage(type, text, controller) {
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        const prefix = type === 'atc' ? (controller?.name || 'ATC') : 'YOU';
        div.textContent = `${prefix}: ${text}`;
        messagesEl.appendChild(div);

        // Keep only last N messages
        while (messagesEl.children.length > MAX_MESSAGES) {
            messagesEl.removeChild(messagesEl.firstChild);
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    connect();
})();
