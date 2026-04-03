const UIController = (function() {
    let elements = {};
    let saveTimeout;
    let expandedCollections = new Set(); // Track which collections are expanded
    let blockEditors = new Map();
    let monacoLoaderPromise = null;
    const THEME_KEY = 'notes_theme';
    const CLEAN_THEME_PATH = 'themes/clean/theme.css?v=1';

    function loadMonaco() {
        if (window.monaco) return Promise.resolve(window.monaco);
        if (!monacoLoaderPromise) {
            monacoLoaderPromise = new Promise((resolve, reject) => {
                if (typeof require === 'undefined') {
                    reject(new Error('Monaco loader not available'));
                    return;
                }
                require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@0.44.0/min/vs' } });
                require(['vs/editor/editor.main'], function() {
                    resolve(window.monaco);
                }, reject);
            });
        }
        return monacoLoaderPromise;
    }

    function ensureThemeLink() {
        let link = document.getElementById('notesThemeLink');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'notesThemeLink';
            document.head.appendChild(link);
        }
        return link;
    }

    function applyTheme(theme) {
        const link = ensureThemeLink();
        if (theme === 'clean') {
            link.href = CLEAN_THEME_PATH;
            document.body.classList.add('theme-clean');
            if (elements.themeClean) elements.themeClean.checked = true;
        } else {
            link.href = '';
            document.body.classList.remove('theme-clean');
            if (elements.themeClassic) elements.themeClassic.checked = true;
        }
        localStorage.setItem(THEME_KEY, theme);
    }

    function initThemeFromStorage() {
        const stored = localStorage.getItem(THEME_KEY) || 'classic';
        applyTheme(stored);
    }

    function initElements() {
        elements = {
            collectionList: document.getElementById('collectionList'),
            notesList: document.getElementById('notesList'),
            editorArea: document.getElementById('editorArea'),
            addCollectionBtn: document.getElementById('addCollectionBtn'),
            addNotebookBtn: document.getElementById('addNotebookBtn'),
            addNoteBtn: document.getElementById('addNoteBtn'),
            deleteNoteBtn: document.getElementById('deleteNoteBtn'),
            floatingToolbar: document.getElementById('floatingToolbar'),
            toolSort: document.getElementById('toolSort'),
            toolReplace: document.getElementById('toolReplace'),
            exportBtn: document.getElementById('exportBtn'),
            importBtn: document.getElementById('importBtn'),
            searchInput: document.getElementById('searchInput'),
            localStorageBtn: document.getElementById('localStorageBtn'),
            sessionStorageBtn: document.getElementById('sessionStorageBtn'),
            currentCollectionPath: document.getElementById('currentCollectionPath'),
            themeClassic: document.getElementById('themeClassic'),
            themeClean: document.getElementById('themeClean')
        };
    }

    function initEventListeners() {
        bindStorageEvents();
        bindCollectionEvents();
        bindNotebookEvents();
        bindAddItemEvents();
        bindNoteEvents();
        bindFloatingToolbarEvents();
        bindSearchEvents();
        bindImportExportEvents();
        bindThemeEvents();
    }

    function bindStorageEvents() {
        elements.localStorageBtn.addEventListener('click', function() {
            StorageDriver.setDriver('localStorage');
            elements.localStorageBtn.classList.add('active');
            elements.sessionStorageBtn.classList.remove('active');
            NoteBook.init();
            renderCollections();
            renderNotes();
            renderEditor();
        });

        elements.sessionStorageBtn.addEventListener('click', function() {
            StorageDriver.setDriver('sessionStorage');
            elements.sessionStorageBtn.classList.add('active');
            elements.localStorageBtn.classList.remove('active');
            NoteBook.init();
            renderCollections();
            renderNotes();
            renderEditor();
        });
    }

    function bindCollectionEvents() {
        // Click on collection list background to deselect
        elements.collectionList.addEventListener('click', function(e) {
            // Only deselect if clicking directly on the collection list (not on children)
            if (e.target === elements.collectionList) {
                NoteBook.setCurrentCollection(null);
                NoteBook.setCurrentNotebook(null);
                renderCollections();
                renderNotes();
                renderEditor();
            }
        });
        
        elements.addCollectionBtn.addEventListener('click', function() {
            const modal = new Modal({
                title: 'New Collection',
                body: '<input type="text" class="modal-input" id="collectionNameInput" placeholder="Enter collection name">',
                primaryButton: {
                    text: 'Create',
                    onClick: (m) => {
                        const name = m.getInputValue('#collectionNameInput');
                        if (name && name.trim()) {
                            let currentCollectionId = NoteBook.getCurrentCollection();
                            // If no collection selected, use first root collection
                            if (!currentCollectionId) {
                                const collections = NoteBook.getCollections();
                                if (collections && collections.length > 0) {
                                    currentCollectionId = collections[0].id;
                                }
                            }
                            const collection = NoteBook.createCollection(name.trim(), currentCollectionId);
                            if (collection) {
                                NoteBook.setCurrentCollection(collection.id);
                                renderCollections();
                                renderNotes();
                            }
                            return true;
                        }
                        m._shakeModal();
                        return false;
                    }
                },
                secondaryButton: {
                    text: 'Cancel'
                },
                onClose: () => modal.destroy(),
                animation: ModalAnimations.fade
            });
            modal.show();
            // Add Enter key listener
            setTimeout(() => {
                const input = document.getElementById('collectionNameInput');
                if (input) {
                    input.focus();
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            modal.elements.primaryButton.click();
                        }
                    });
                }
            }, 0);
        });
    }

    function bindNotebookEvents() {
        elements.addNotebookBtn.addEventListener('click', function() {
            let currentCollectionId = NoteBook.getCurrentCollection();
            // If no collection selected, use first root collection
            if (!currentCollectionId) {
                const collections = NoteBook.getCollections();
                if (collections && collections.length > 0) {
                    currentCollectionId = collections[0].id;
                } else {
                    Modal.alert('No Collection', 'No collection available.');
                    return;
                }
            }
            
            const modal = new Modal({
                title: 'New Notebook',
                body: '<input type="text" class="modal-input" id="notebookNameInput" placeholder="Enter notebook name">',
                primaryButton: {
                    text: 'Create',
                    onClick: (m) => {
                        const name = m.getInputValue('#notebookNameInput');
                        if (name && name.trim() && currentCollectionId) {
                            const notebook = NoteBook.createNotebook(currentCollectionId, name.trim());
                            if (notebook) {
                                NoteBook.setCurrentNotebook(notebook.id);
                                renderCollections();
                                renderNotes();
                            }
                            return true;
                        }
                        m._shakeModal();
                        return false;
                    }
                },
                secondaryButton: {
                    text: 'Cancel'
                },
                onClose: () => modal.destroy()
            });
            modal.show();
        });
    }

    function bindAddItemEvents() {
        window.addItemToCollection = function(collectionId) {
            const modal = new Modal({
                title: 'Add Item to Collection',
                body: `
                    <div class="modal-radio-group">
                        <label>
                            <input type="radio" name="itemType" value="collection" checked>
                            <span>Collection</span>
                        </label>
                        <label>
                            <input type="radio" name="itemType" value="notebook">
                            <span>Notebook</span>
                        </label>
                    </div>
                    <input type="text" class="modal-input" id="addItemNameInput" placeholder="Enter name">
                `,
                primaryButton: {
                    text: 'Create',
                    onClick: (m) => {
                        const name = m.getInputValue('#addItemNameInput');
                        const itemType = m.elements.body.querySelector('input[name="itemType"]:checked').value;
                        
                        if (name && name.trim() && collectionId) {
                            if (itemType === 'collection') {
                                NoteBook.createCollection(name.trim(), collectionId);
                            } else {
                                NoteBook.createNotebook(collectionId, name.trim());
                            }
                            renderCollections();
                            return true;
                        }
                        m._shakeModal();
                        return false;
                    }
                },
                secondaryButton: {
                    text: 'Cancel'
                },
                onClose: () => modal.destroy()
            });
            modal.show();
        };
    }

    function bindNoteEvents() {
        elements.addNoteBtn.addEventListener('click', function() {
            const currentNotebookId = NoteBook.getCurrentNotebook();
            if (!currentNotebookId) {
                Modal.alert('Error', 'No Notebook selected');
                return;
            }
            
            const note = NoteBook.createNote(currentNotebookId, 'Untitled Note', '');
            if (!note) {
                Modal.alert('Error', 'No Notebook selected');
                return;
            }

            NoteBook.setCurrentNote(note.id);
            renderNotes();
            renderEditor();
        });

        elements.deleteNoteBtn.addEventListener('click', function() {
            const currentNotebookId = NoteBook.getCurrentNotebook();
            const currentNoteId = NoteBook.getCurrentNote();

            if (!currentNotebookId) {
                Modal.alert('Error', 'No Notebook selected');
                return;
            }

            if (!currentNoteId) {
                Modal.alert('Error', 'No note selected for deleting');
                return;
            }
            
            Modal.confirm(
                'Delete Note',
                'Are you sure you want to delete this note? This action cannot be undone.',
                () => {
                    NoteBook.deleteNote(currentNotebookId, currentNoteId);
                    renderNotes();
                    renderEditor();
                }
            );
        });
    }

    function bindFloatingToolbarEvents() {
        elements.toolSort.addEventListener('click', function() {
            if (NoteProcessor.sortSubsection()) {
                renderEditor();
            }
        });

        elements.toolReplace.addEventListener('click', function() {
            const currentNotebookId = NoteBook.getCurrentNotebook();
            const currentNoteId = NoteBook.getCurrentNote();
            
            if (!currentNotebookId || !currentNoteId) {
                Modal.alert('No Note Selected', 'Please select a note first.');
                return;
            }
            
            const modal = new Modal({
                title: 'Find & Replace',
                body: `
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 14px;">Find:</label>
                        <input type="text" class="modal-input" id="findInput" placeholder="Text to find..." style="margin-bottom: 0;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 4px; font-size: 14px;">Replace with:</label>
                        <input type="text" class="modal-input" id="replaceInput" placeholder="Replacement text..." style="margin-bottom: 0;">
                    </div>
                `,
                primaryButton: {
                    text: 'Replace All',
                    onClick: (m) => {
                        const findText = m.getInputValue('#findInput');
                        const replaceText = m.getInputValue('#replaceInput');
                        
                        if (!findText) {
                            Modal.alert('Missing Input', 'Please enter text to find.');
                            return false;
                        }

                        const note = NoteBook.getNote(currentNotebookId, currentNoteId);
                        
                        if (Array.isArray(note.content)) {
                            note.content.forEach(block => {
                                if (block.text) {
                                    block.text = block.text.split(findText).join(replaceText);
                                }
                            });
                        }

                        NoteBook.updateNote(currentNotebookId, currentNoteId, { content: note.content });
                        renderEditor();
                        return true;
                    }
                },
                secondaryButton: {
                    text: 'Cancel'
                },
                onClose: () => modal.destroy()
            });
            modal.show();
        });
    }

    function bindSearchEvents() {
        elements.searchInput.addEventListener('input', function() {
            const query = this.value.trim();
            if (query) {
                const results = NoteBook.searchNotes(query);
                renderSearchResults(results);
            } else {
                renderNotes();
            }
        });
    }

    function bindImportExportEvents() {
        elements.exportBtn.addEventListener('click', function() {
            const data = NoteBook.exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'note_export_' + new Date().getTime() + '.json';
            a.click();
            URL.revokeObjectURL(url);
        });

        elements.importBtn.addEventListener('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        if (NoteBook.importData(event.target.result)) {
                            renderCollections();
                            renderNotes();
                            Modal.alert('Import Successful', 'Data imported successfully!');
                        } else {
                            Modal.alert('Import Failed', 'Failed to import data. Please check the file format.');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            
            input.click();
        });
    }

    function bindThemeEvents() {
        if (elements.themeClassic) {
            elements.themeClassic.addEventListener('change', function() {
                if (this.checked) {
                    applyTheme('classic');
                }
            });
        }

        if (elements.themeClean) {
            elements.themeClean.addEventListener('change', function() {
                if (this.checked) {
                    applyTheme('clean');
                }
            });
        }
    }

    function renderCollections() {
        const collections = NoteBook.getCollections();
        const currentCollectionId = NoteBook.getCurrentCollection();
        const currentNotebookId = NoteBook.getCurrentNotebook();
        elements.collectionList.innerHTML = '';
        
        function renderItemElement(item, level = 0) {
            const div = document.createElement('div');
            div.className = 'tree-item';
            div.style.paddingLeft = (level * 20 + 15) + 'px';
            
            const isCollection = item.type === 'collection';
            const isNotebook = item.type === 'notebook';
            const isActive = currentNotebookId 
                ? (isNotebook && item.id === currentNotebookId)
                : (isCollection && item.id === currentCollectionId);
            
            if (isActive) {
                div.classList.add('active');
            }
            
            const icon = isCollection
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
            const hasChildren = isCollection && item.items && item.items.length > 0;
            const isExpanded = expandedCollections.has(item.id);
            div.classList.toggle('has-children', hasChildren);
            div.classList.toggle('expanded', hasChildren && isExpanded);
            
            // Add data-item-id for drag-drop functionality
            div.dataset.itemId = item.id;
            div.draggable = true;
            div.dataset.itemType = item.type;

            div.innerHTML = `
                <span class="tree-item-icon">${icon}</span>
                <span class="tree-item-name">${item.name}</span>
                <div class="tree-item-actions">
                    ${isCollection ? `<button onclick="window.addItemToCollection('${item.id}')">+</button>` : ''}
                    <button onclick="window.renameItem('${item.id}', '${item.type}')" title="Rename"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
                    <button onclick="window.deleteItem('${item.id}', '${item.type}')" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
            `;
            
            const nameSpan = div.querySelector('.tree-item-name');
            const iconSpan = div.querySelector('.tree-item-icon');

            // Show full item name on hover when text is truncated
            nameSpan.setAttribute('title', item.name || '');
            
            // Click on name to select
            nameSpan.addEventListener('click', function(e) {
                e.stopPropagation();
                if (isCollection) {
                    NoteBook.setCurrentCollection(item.id);
                    if (hasChildren && !expandedCollections.has(item.id)) {
                        expandedCollections.add(item.id);
                    }
                } else if (isNotebook) {
                    NoteBook.setCurrentNotebook(item.id);
                }
                renderCollections();
                renderNotes();
                renderEditor();
            });

            // Icon click toggles expand for collections; selects notebooks
            iconSpan.addEventListener('click', function(e) {
                e.stopPropagation();
                if (isCollection && hasChildren) {
                    if (expandedCollections.has(item.id)) {
                        expandedCollections.delete(item.id);
                    } else {
                        expandedCollections.add(item.id);
                    }
                    renderCollections();
                } else if (isNotebook) {
                    NoteBook.setCurrentNotebook(item.id);
                    renderCollections();
                    renderNotes();
                    renderEditor();
                }
            });

            if (hasChildren) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-children';
                childrenContainer.style.display = isExpanded ? 'block' : 'none';
                
                // Recursively render children
                item.items.forEach(child => {
                    childrenContainer.appendChild(renderItemElement(child, level + 1));
                });
                
                // Return fragment containing both the item and its children
                const fragment = document.createDocumentFragment();
                fragment.appendChild(div);
                fragment.appendChild(childrenContainer);
                return fragment;
            }
            
            return div;
        }
        
        if (collections.length === 1 && collections[0].items) {
            collections[0].items.forEach(item => {
                const el = renderItemElement(item, 0);
                elements.collectionList.appendChild(el);
            });
            
            if (!currentCollectionId && !currentNotebookId && collections[0].items.length > 0) {
                const firstItem = collections[0].items[0];
                if (firstItem.type === 'collection') {
                    NoteBook.setCurrentCollection(firstItem.id);
                    expandedCollections.add(firstItem.id);
                } else {
                    NoteBook.setCurrentNotebook(firstItem.id);
                }
            }
        } else {
            collections.forEach(collection => {
                const el = renderItemElement(collection, 0);
                elements.collectionList.appendChild(el);
            });
            
            if (!currentCollectionId && collections.length > 0) {
                NoteBook.setCurrentCollection(collections[0].id);
                expandedCollections.add(collections[0].id);
            }
        }
        
        updateCollectionPath();
    }
    
    function updateCollectionPath() {
        const currentCollectionId = NoteBook.getCurrentCollection();
        const currentNotebookId = NoteBook.getCurrentNotebook();
        const currentNoteId = NoteBook.getCurrentNote();
        
        if (!elements.currentCollectionPath) return;
        
        const fullPath = NoteBook.getPath();
        
        if (fullPath.length === 0) {
            elements.currentCollectionPath.textContent = 'No selection';
            return;
        }
        
        elements.currentCollectionPath.innerHTML = '';
        
        fullPath.forEach((pathItem, index) => {
            const span = document.createElement('span');
            span.className = 'breadcrumb-segment';
            span.textContent = pathItem.name;
            span.style.cursor = 'pointer';
            span.style.color = '#007acc';
            
            span.addEventListener('click', function() {
                const targetPath = fullPath.slice(0, index + 1);
                NoteBook.setPath(targetPath);
                
                renderCollections();
                renderNotes();
                renderEditor();
            });
            
            // Hover effect
            span.addEventListener('mouseenter', function() {
                span.style.textDecoration = 'underline';
            });
            span.addEventListener('mouseleave', function() {
                span.style.textDecoration = 'none';
            });
            
            elements.currentCollectionPath.appendChild(span);
            
            // Add separator if not the last item
            if (index < fullPath.length - 1) {
                const separator = document.createElement('span');
                separator.textContent = ' > ';
                separator.style.color = '#999';
                elements.currentCollectionPath.appendChild(separator);
            }
        });
    }

    function renderNotebooks() {
        renderCollections();
    }

    function renderNotes() {
        const currentNotebookId = NoteBook.getCurrentNotebook();
        
        if (!currentNotebookId) {
            elements.notesList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No notebook selected</div>';
            return;
        }
        
        const notes = NoteBook.getNotes(currentNotebookId);
        const currentNoteId = NoteBook.getCurrentNote();
        elements.notesList.innerHTML = '';
        
        notes.forEach(note => {
            const div = document.createElement('div');
            div.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
            
            const contentPreview = Array.isArray(note.content) && note.content.length > 0
                ? note.content[0].text.substring(0, 50)
                : '';
            
            div.innerHTML = `
                <div class="note-title">${note.title}</div>
                <div class="note-preview">${contentPreview}</div>
            `;

            const noteTitleElement = div.querySelector('.note-title');
            if (noteTitleElement) {
                noteTitleElement.setAttribute('title', note.title || '');
            }
            
            div.addEventListener('click', function() {
                NoteBook.setCurrentNote(note.id);
                renderNotes();
                renderEditor();
                updateCollectionPath(); // Update breadcrumb to show note title
            });
            
            elements.notesList.appendChild(div);
        });
    }

    function renderEditor() {
        const currentNotebookId = NoteBook.getCurrentNotebook();
        const currentNoteId = NoteBook.getCurrentNote();

        // Dispose existing Monaco editors before re-rendering blocks
        blockEditors.forEach(editor => {
            if (editor && typeof editor.dispose === 'function') {
                editor.dispose();
            }
        });
        blockEditors.clear();

        if (!currentNotebookId || !currentNoteId) {
            elements.editorArea.innerHTML = '<div class="empty-state">Select a note or create a new one</div>';
            elements.floatingToolbar.classList.remove('visible');
            return;
        }

        const note = NoteBook.getNote(currentNotebookId, currentNoteId);
        
        if (!note) {
            elements.editorArea.innerHTML = '<div class="empty-state">Note not found</div>';
            elements.floatingToolbar.classList.remove('visible');
            return;
        }

        if (!Array.isArray(note.content)) {
            note.content = [];
        }

        elements.floatingToolbar.classList.add('visible');

        elements.editorArea.innerHTML = `
            <div class="note-editor" id="noteEditorCard">
                <div class="note-editor__header">
                    <input type="text" class="note-editor__title" id="noteTitleInput" value="${note.title}" placeholder="Note title">
                </div>
                <div class="note-editor__body">
                    <div class="editor-content" id="editorContentContainer"></div>
                </div>
            </div>
        `;

        elements.editorArea.appendChild(elements.floatingToolbar);

        const titleInput = document.getElementById('noteTitleInput');
        const contentContainer = document.getElementById('editorContentContainer');

        function triggerSave() {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(function() {
                NoteBook.updateNote(currentNotebookId, currentNoteId, {
                    title: titleInput.value,
                    content: note.content
                });
                renderNotes();
                updateCollectionPath(); // Update breadcrumb when note title changes
            }, 500);
        }

        titleInput.addEventListener('input', triggerSave);

        function generateBlockId() {
            return 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        function createTextBlock(text = '', blockId = null, isHighlighted = false, isCodeMode = false) {
            const id = blockId || generateBlockId();
            const wrapper = document.createElement('div');
            wrapper.className = 'text-block-card';
            if (isHighlighted) {
                wrapper.classList.add('text-block-card--highlight');
            }
            wrapper.dataset.blockId = id;

            const header = document.createElement('div');
            header.className = 'text-block-card__header';

            const handle = document.createElement('div');
            handle.className = 'text-block-card__handle';
            handle.title = 'Drag block';
            handle.textContent = '|||';
            handle.draggable = true;

            const actions = document.createElement('div');
            actions.className = 'text-block-card__actions';

            const sortBtn = document.createElement('button');
            sortBtn.className = 'text-block-card__btn';
            sortBtn.textContent = 'Sort';
            sortBtn.title = 'Sort this block';

            const codeBtn = document.createElement('button');
            codeBtn.className = 'text-block-card__btn';
            codeBtn.textContent = isCodeMode ? 'Text' : 'Code';
            codeBtn.title = 'Toggle code mode';

            const highlightBtn = document.createElement('button');
            highlightBtn.className = 'text-block-card__btn';
            highlightBtn.textContent = isHighlighted ? 'Unhighlight' : 'Highlight';
            highlightBtn.title = 'Toggle highlight';

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'text-block-card__btn text-block-card__btn--danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.title = 'Delete this block';

            actions.appendChild(sortBtn);
            actions.appendChild(codeBtn);
            actions.appendChild(highlightBtn);
            actions.appendChild(deleteBtn);

            header.appendChild(handle);
            header.appendChild(actions);

            const body = document.createElement('div');
            body.className = 'text-block-card__body';

            const textarea = document.createElement('textarea');
            textarea.className = 'text-block';
            textarea.value = text;
            textarea.placeholder = 'Type ...';
            textarea.dataset.mode = isCodeMode ? 'code' : 'text';
            let codeContainer = null;
            
            // Auto-resize function
            function autoResize() {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
            }
            
            textarea.addEventListener('input', function() {
                autoResize();
                const blockIndex = note.content.findIndex(b => b.id === id);
                if (blockIndex !== -1) {
                    note.content[blockIndex].text = this.value;
                    note.content[blockIndex].codeMode = note.content[blockIndex].codeMode || false;
                } else {
                    note.content.push({ id, text: this.value, highlighted: false, codeMode: isCodeMode });
                }
                triggerSave();
            });
            
            setTimeout(autoResize, 0);
            
            textarea.addEventListener('blur', function() {
                if (this.value.trim() === '') {
                    const blockIndex = note.content.findIndex(b => b.id === id);
                    if (blockIndex !== -1) {
                        note.content.splice(blockIndex, 1);
                        wrapper.remove();
                        triggerSave();
                    }
                }
            });

            sortBtn.addEventListener('click', function() {
                if (NoteProcessor.sortSubsection(id)) {
                    renderEditor();
                }
            });

            function setCodeMode(enable) {
                const blockIndex = note.content.findIndex(b => b.id === id);

                if (enable) {
                    loadMonaco().then(monaco => {
                        if (blockEditors.has(id)) {
                            return;
                        }

                        textarea.style.display = 'none';
                        codeContainer = document.createElement('div');
                        codeContainer.className = 'text-block-card__code';
                        body.appendChild(codeContainer);

                        const editor = monaco.editor.create(codeContainer, {
                            value: textarea.value || '',
                            language: 'javascript',
                            theme: 'vs-dark',
                            automaticLayout: true,
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineNumbers: 'on'
                        });

                        editor.onDidChangeModelContent(function() {
                            const value = editor.getValue();
                            textarea.value = value;
                            const idx = note.content.findIndex(b => b.id === id);
                            if (idx !== -1) {
                                note.content[idx].text = value;
                                note.content[idx].codeMode = true;
                            }
                            triggerSave();
                        });

                        blockEditors.set(id, editor);
                        if (blockIndex !== -1) {
                            note.content[blockIndex].codeMode = true;
                        }
                        codeBtn.textContent = 'Text';
                        textarea.dataset.mode = 'code';
                        triggerSave();
                    }).catch(err => {
                        console.error('Monaco load failed', err);
                    });
                } else {
                    const editor = blockEditors.get(id);
                    if (editor) {
                        const value = editor.getValue();
                        textarea.value = value;
                        editor.dispose();
                        blockEditors.delete(id);
                    }
                    if (codeContainer) {
                        codeContainer.remove();
                        codeContainer = null;
                    }
                    textarea.style.display = 'block';
                    const idx = note.content.findIndex(b => b.id === id);
                    if (idx !== -1) {
                        note.content[idx].codeMode = false;
                        note.content[idx].text = textarea.value;
                    }
                    codeBtn.textContent = 'Code';
                    textarea.dataset.mode = 'text';
                    triggerSave();
                }
            }

            codeBtn.addEventListener('click', function() {
                const blockIndex = note.content.findIndex(b => b.id === id);
                const isCurrentlyCode = blockIndex !== -1 ? !!note.content[blockIndex].codeMode : textarea.dataset.mode === 'code';
                setCodeMode(!isCurrentlyCode);
            });

            highlightBtn.addEventListener('click', function() {
                const blockIndex = note.content.findIndex(b => b.id === id);
                const nextState = !(blockIndex !== -1 ? !!note.content[blockIndex].highlighted : isHighlighted);
                if (blockIndex !== -1) {
                    note.content[blockIndex].highlighted = nextState;
                    note.content[blockIndex].codeMode = note.content[blockIndex].codeMode || false;
                }
                wrapper.classList.toggle('text-block-card--highlight', nextState);
                highlightBtn.textContent = nextState ? 'Unhighlight' : 'Highlight';
                triggerSave();
            });

            deleteBtn.addEventListener('click', function() {
                const blockIndex = note.content.findIndex(b => b.id === id);
                if (blockIndex !== -1) {
                    const existingEditor = blockEditors.get(id);
                    if (existingEditor) {
                        existingEditor.dispose();
                        blockEditors.delete(id);
                    }
                    note.content.splice(blockIndex, 1);
                }
                wrapper.remove();
                triggerSave();
            });

            handle.addEventListener('dragstart', function(e) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
                wrapper.classList.add('dragging');
            });

            handle.addEventListener('dragend', function() {
                wrapper.classList.remove('dragging');
            });

            body.appendChild(textarea);
            wrapper.appendChild(header);
            wrapper.appendChild(body);

            // Auto-enable code mode if stored
            if (isCodeMode) {
                setTimeout(() => setCodeMode(true), 0);
            }

            return wrapper;
        }

        note.content.forEach(block => {
            const blockEl = createTextBlock(
                block.text,
                block.id,
                !!block.highlighted,
                !!block.codeMode
            );
            contentContainer.appendChild(blockEl);
        });

        contentContainer.addEventListener('click', function(e) {
            if (e.target === contentContainer) {
                const newBlockId = generateBlockId();
                note.content.push({ id: newBlockId, text: '', highlighted: false, codeMode: false });
                const newBlock = createTextBlock('', newBlockId, false, false);
                contentContainer.appendChild(newBlock);
                newBlock.querySelector('textarea').focus();
                triggerSave();
            }
        });

        function reorderBlocks(sourceId, targetId) {
            if (!sourceId || !targetId || sourceId === targetId) return;
            const sourceIndex = note.content.findIndex(b => b.id === sourceId);
            const targetIndex = note.content.findIndex(b => b.id === targetId);
            if (sourceIndex === -1 || targetIndex === -1) return;
            const [moved] = note.content.splice(sourceIndex, 1);
            note.content.splice(targetIndex, 0, moved);
            triggerSave();
            renderEditor();
        }

        contentContainer.addEventListener('dragover', function(e) {
            if (e.dataTransfer.types.includes('text/plain')) {
                e.preventDefault();
            }
        });

        contentContainer.addEventListener('drop', function(e) {
            e.preventDefault();
            const sourceId = e.dataTransfer.getData('text/plain');
            const targetWrapper = e.target.closest('.text-block-card');
            const targetId = targetWrapper ? targetWrapper.dataset.blockId : null;
            reorderBlocks(sourceId, targetId || sourceId);
        });
    }

    function renderSearchResults(results) {
        const currentNoteId = NoteBook.getCurrentNote();
        elements.notesList.innerHTML = '';
        
        if (results.length === 0) {
            elements.notesList.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No results found</div>';
            return;
        }
        
        results.forEach(result => {
            const div = document.createElement('div');
            div.className = 'note-item' + (result.note.id === currentNoteId ? ' active' : '');
            
            const contentPreview = Array.isArray(result.note.content) && result.note.content.length > 0
                ? result.note.content[0].text.substring(0, 50)
                : '';
            
            div.innerHTML = `
                <div class="note-title">${result.note.title}</div>
                <div class="note-preview">${result.notebookName}</div>
                <div class="note-preview">${contentPreview}</div>
            `;
            
            div.addEventListener('click', function() {
                NoteBook.setCurrentNotebook(result.notebookId);
                NoteBook.setCurrentNote(result.note.id);
                elements.searchInput.value = '';
                renderCollections();
                renderNotes();
                renderEditor();
                updateCollectionPath(); // Update breadcrumb when selecting from search
            });
            
            elements.notesList.appendChild(div);
        });
    }

    function init() {
        initElements();
        NoteBook.init();
        initThemeFromStorage();
        
        if (elements.currentCollectionPath) {
            elements.currentCollectionPath.textContent = 'No selection';
        }
        
        renderCollections();
        Draggable.init('#floatingToolbar');
        Draggable.initCollectionDragDrop();
        initEventListeners();

        window.renameItem = function(itemId, itemType) {
            const item = itemType === 'collection' 
                ? NoteBook.getCollection(itemId) 
                : NoteBook.getNotebook(itemId);
            if (!item) return;
            
            const newName = prompt(`Enter new ${itemType} name:`, item.name);
            if (newName && newName.trim()) {
                if (itemType === 'collection') {
                    NoteBook.updateCollection(itemId, { name: newName.trim() });
                } else {
                    NoteBook.updateNotebook(itemId, { name: newName.trim() });
                }
                renderCollections();
            }
        };

        window.deleteItem = function(itemId, itemType) {
            const item = itemType === 'collection' 
                ? NoteBook.getCollection(itemId) 
                : NoteBook.getNotebook(itemId);
            if (!item) return;
            
            Modal.confirm(
                `Delete ${itemType === 'collection' ? 'Collection' : 'Notebook'}`,
                `Are you sure you want to delete "${item.name}"${itemType === 'collection' ? ' and all its contents' : ' and all its notes'}? This action cannot be undone.`,
                () => {
                    let deleted = false;
                    if (itemType === 'collection') {
                        deleted = NoteBook.deleteCollection(itemId);
                    } else {
                        deleted = NoteBook.deleteNotebook(itemId);
                    }

                    if (!deleted) {
                        const reason = NoteBook.getLastOperationError() || 'Unknown error while deleting item.';
                        Modal.alert('Delete Failed', reason);
                        return;
                    }

                    renderCollections();
                    renderNotes();
                    renderEditor();
                }
            );
        };

        // Keep old functions for backward compatibility
        window.renameNotebook = function(notebookId) {
            window.renameItem(notebookId, 'notebook');
        };

        window.deleteNotebook = function(notebookId) {
            window.deleteItem(notebookId, 'notebook');
        };

        // Handle moving items to another collection via drag-drop
        window.moveItemToCollection = function(itemId, targetCollectionId, itemType) {
            const item = itemType === 'collection' 
                ? NoteBook.getCollection(itemId) 
                : NoteBook.getNotebook(itemId);
            
            if (!item) {
                Modal.alert('Error', 'Could not find item.');
                return;
            }
            
            // Handle moving to root collection
            let targetCollection;
            if (targetCollectionId === 'ROOT') {
                const collections = NoteBook.getCollections();
                if (!collections || collections.length === 0) {
                    Modal.alert('Error', 'No root collection found.');
                    return;
                }
                targetCollection = collections[0];
                targetCollectionId = targetCollection.id;
            } else {
                targetCollection = NoteBook.getCollection(targetCollectionId);
            }
            
            if (!targetCollection) {
                Modal.alert('Error', 'Could not find target collection.');
                return;
            }

            // Prevent moving to the same location
            if (itemId === targetCollectionId) return;

            // Move the item
            const moved = NoteBook.moveItemToCollection(itemId, targetCollectionId, itemType);
            if (!moved) {
                const reason = NoteBook.getLastOperationError() || 'Unknown error while moving item.';
                Modal.alert('Move Failed', reason);
                return;
            }
            
            // Show confirmation
            Modal.alert('Success', `"${item.name}" moved to "${targetCollection.name}".`, () => {
                renderCollections();
                renderNotes();
                renderEditor();
            });
        };
    }

    return { init };
})();

window.addEventListener('load', UIController.init);
