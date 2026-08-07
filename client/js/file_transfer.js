/**
 * FileTransfer handles sending files from the client to the server over a binary WebSocket connection.
 */
export default class FileTransfer {
    /**
     * @param {Object} wsManager - The WebSocket manager instance. Must have `ws` (raw WebSocket) and `isConnected`.
     */
    constructor(wsManager) {
        this.wsManager = wsManager;
        this.CHUNK_SIZE = 32 * 1024; // 32KB
        this.isUploading = false;
        
        // Ensure file input has change listener
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.sendFile(e.target.files[0]);
                }
            });
        }
    }

    /**
     * Programmatically click the hidden file input element to open file selector.
     */
    selectFile() {
        if (this.isUploading) {
            this.showToast('An upload is already in progress.', true);
            return;
        }
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = ''; // Reset to allow selecting the same file again
            fileInput.click();
        } else {
            console.error('File input element #file-input not found.');
        }
    }

    /**
     * Setup drag-and-drop on a specified DOM element.
     * @param {string} elementId - The ID of the DOM element to enable drag-and-drop on.
     */
    setupDragDrop(elementId) {
        const dropZone = document.getElementById(elementId);
        if (!dropZone) {
            console.error(`Drop zone element #${elementId} not found.`);
            return;
        }

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('drag-active'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('drag-active'), false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                if (!this.isUploading) {
                    this.sendFile(files[0]);
                } else {
                    this.showToast('An upload is already in progress.', true);
                }
            }
        }, false);
    }

    /**
     * Sends the file object via WebSocket using the binary protocol.
     * @param {File} file - The file to upload.
     */
    async sendFile(file) {
        if (!this.wsManager.isConnected) {
            this.showToast('WebSocket is not connected.', true);
            return;
        }
        
        if (this.isUploading) {
            this.showToast('An upload is already in progress.', true);
            return;
        }
        
        this.isUploading = true;
        this.showProgress();
        this.updateProgress(0);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const filenameBytes = new TextEncoder().encode(file.name);
            
            if (filenameBytes.length > 65535) {
                throw new Error("Filename is too long (exceeds 65535 bytes)");
            }

            // 0x10 = File Upload Start: [0x10, filenameLen(uint16 BE), ...filename UTF-8 bytes, fileSize(uint32 BE)]
            const headerSize = 1 + 2 + filenameBytes.length + 4;
            const headerBuffer = new ArrayBuffer(headerSize);
            const headerView = new DataView(headerBuffer);
            const headerBytes = new Uint8Array(headerBuffer);

            headerView.setUint8(0, 0x10);
            headerView.setUint16(1, filenameBytes.length, false); // false = Big Endian
            headerBytes.set(filenameBytes, 3);
            headerView.setUint32(3 + filenameBytes.length, file.size, false);

            this.wsManager.ws.send(headerBuffer);

            // Send chunks
            // 0x11 = File Upload Chunk: [0x11, chunkIndex(uint16 BE), ...raw data bytes]
            const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
            const fileBytes = new Uint8Array(arrayBuffer);

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * this.CHUNK_SIZE;
                const end = Math.min(start + this.CHUNK_SIZE, file.size);
                const chunkData = fileBytes.slice(start, end);

                const chunkBuffer = new ArrayBuffer(1 + 2 + chunkData.length);
                const chunkView = new DataView(chunkBuffer);
                const chunkBytes = new Uint8Array(chunkBuffer);

                chunkView.setUint8(0, 0x11);
                chunkView.setUint16(1, chunkIndex, false);
                chunkBytes.set(chunkData, 3);

                this.wsManager.ws.send(chunkBuffer);

                // Update progress UI
                const progress = ((chunkIndex + 1) / totalChunks) * 100;
                this.updateProgress(progress);
                
                // Allow UI to breathe
                if (chunkIndex % 10 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            
            // Note: After all chunks are sent, we wait for the 0x12 Server Ack, which calls onAck()
            
        } catch (error) {
            console.error('File upload failed:', error);
            this.hideProgress();
            this.showToast('File upload failed: ' + error.message, true);
            this.isUploading = false;
        }
    }

    /**
     * Called by the main app when 0x12 is received from the server.
     * @param {number} status - 0 for OK, 1 for error.
     */
    onAck(status) {
        this.hideProgress();
        this.isUploading = false;
        
        if (status === 0) {
            this.showToast('File uploaded successfully!');
        } else {
            this.showToast('Server returned an error during upload.', true);
        }
        
        // Reset file input
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    showProgress() {
        const progressOverlay = document.getElementById('upload-progress');
        if (progressOverlay) {
            progressOverlay.style.display = 'flex';
        }
    }

    hideProgress() {
        const progressOverlay = document.getElementById('upload-progress');
        if (progressOverlay) {
            progressOverlay.style.display = 'none';
        }
    }

    updateProgress(percentage) {
        const pctString = Math.round(percentage) + '%';
        const bar = document.getElementById('upload-bar');
        const pctLabel = document.getElementById('upload-percent');
        
        if (bar) bar.style.width = pctString;
        if (pctLabel) pctLabel.innerText = pctString;
    }

    showToast(message, isError = false) {
        console.log(isError ? 'Error: ' : 'Success: ', message);
        // Basic toast implementation if there's no pre-existing framework
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.padding = '10px 20px';
        toast.style.background = isError ? '#f44336' : '#4CAF50';
        toast.style.color = 'white';
        toast.style.borderRadius = '4px';
        toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        toast.style.zIndex = '1000';
        toast.style.fontFamily = 'sans-serif';
        toast.innerText = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }
}
