// main.js

const { Plugin, Notice, PluginSettingTab, Setting, Modal, MarkdownView } = require('obsidian');

class RPGInventoryPlugin extends Plugin {
    async onload() {
        console.log('Loading RPG Inventory plugin');

        // Load settings
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Register plugin settings tab
        this.addSettingTab(new RPGInventorySettingTab(this.app, this));

        // Register commands
        this.addCommand({
            id: 'open-inventory',
            name: 'Open Inventory',
            callback: () => {
                new InventoryModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'open-shop',
            name: 'Open Shop',
            callback: () => {
                new ShopSelectionModal(this.app, this).open();
            }
        });

        // Add ribbon icon to open shop selection
        this.addRibbonIcon('backpack', 'RPG System', () => {
            new InventoryModal(this.app, this).open();
        });

        // Register view for inventory
        this.registerView(
            'rpg-inventory-view',
            (leaf) => new RPGInventoryView(leaf, this)
        );

        // Register markdown codeblock processor
        this.registerMarkdownCodeBlockProcessor('rpg-inventory', (source, el, ctx) => {
            el.createEl('h2', { text: 'RPG Inventory' });
            
            const coinDisplay = el.createEl('div', { cls: 'rpg-inventory-coins' });
            coinDisplay.createEl('span', { text: `Coins: ${this.settings.coins}` });
            
            const inventoryList = el.createEl('div', { cls: 'rpg-inventory-list' });
            if (this.settings.inventory.length === 0) {
                inventoryList.createEl('p', { text: 'Your inventory is empty.' });
            } else {
                const table = inventoryList.createEl('table');
                const headerRow = table.createEl('tr');
                headerRow.createEl('th', { text: 'Item' });
                headerRow.createEl('th', { text: 'Quantity' });
                
                this.settings.inventory.forEach(item => {
                    const row = table.createEl('tr');
                    row.createEl('td', { text: item.name });
                    row.createEl('td', { text: item.quantity.toString() });
                });
            }
            
            // Add shop button
            const shopButton = el.createEl('button', { text: 'Open Shop' });
            shopButton.addEventListener('click', () => {
                new ShopModal(this.app, this).open();
            });
        });
    }

    onunload() {
        console.log('Unloading RPG Inventory plugin');
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class RPGInventoryView extends MarkdownView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return 'rpg-inventory-view';
    }

    getDisplayText() {
        return 'RPG Inventory';
    }

    async onOpen() {
        // View initialization code
    }
}

class InventoryModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Your Inventory' });
        
        // Display coins
        const coinDisplay = contentEl.createEl('div', { cls: 'inventory-coins' });
        coinDisplay.createEl('h3', { text: `Coins: ${this.plugin.settings.coins}` });
        
        // Display inventory
        const inventoryContainer = contentEl.createEl('div', { cls: 'inventory-container' });
        
        if (this.plugin.settings.inventory.length === 0) {
            inventoryContainer.createEl('p', { text: 'Your inventory is empty.' });
        } else {
            const table = inventoryContainer.createEl('table');
            const headerRow = table.createEl('tr');
            headerRow.createEl('th', { text: 'Item' });
            headerRow.createEl('th', { text: 'Quantity' });
            headerRow.createEl('th', { text: 'Action' });
            
            this.plugin.settings.inventory.forEach(item => {
                const row = table.createEl('tr');
                row.createEl('td', { text: item.name });
                row.createEl('td', { text: item.quantity.toString() });
                
                const actionCell = row.createEl('td');
                const useButton = actionCell.createEl('button', { text: 'Use' });
                useButton.addEventListener('click', () => {
                    new Notice(`Used ${item.name}!`);
                });
                
                const sellButton = actionCell.createEl('button', { text: 'Sell' });
                sellButton.addEventListener('click', async () => {
                    // Calculate sell price (half of buy price or 25 coins minimum)
                    const sellPrice = Math.max(Math.floor((item.price || 50) / 2), 25);
                    
                    // Update inventory
                    if (item.quantity > 1) {
                        item.quantity -= 1;
                    } else {
                        const index = this.plugin.settings.inventory.indexOf(item);
                        this.plugin.settings.inventory.splice(index, 1);
                    }
                    
                    // Add coins
                    this.plugin.settings.coins += sellPrice;
                    await this.plugin.saveSettings();
                    
                    new Notice(`Sold ${item.name} for ${sellPrice} coins!`);
                    this.onOpen(); // Refresh the modal
                });
            });
        }
        
        // Add shop button
        const shopButton = contentEl.createEl('button', { text: 'Open Shop', cls: 'mod-cta' });
        shopButton.addEventListener('click', () => {
            this.close();
            new ShopModal(this.app, this.plugin).open();
        });
        
        // Add adventure button
        const adventureButton = contentEl.createEl('button', { text: 'Find Treasure! 🎲' });
        adventureButton.addEventListener('click', async () => {
            const treasureValue = Math.floor(Math.random() * 100) + 1;
            
            if (treasureValue > 30) {
                this.plugin.settings.coins += treasureValue;
                await this.plugin.saveSettings();
                new Notice(`You found ${treasureValue} coins!`);
                this.onOpen(); // Refresh the modal
            } else {
                new Notice("You found nothing this time. Try again!");
            }
        });
        
        // Add return to shop selection button
        const returnButton = contentEl.createEl('button', { text: 'Return to Shop Selection' });
        returnButton.addEventListener('click', () => {
            this.close();
            new ShopSelectionModal(this.app, this.plugin).open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ShopModal extends Modal {
    constructor(app, plugin, shop) {
        super(app);
        this.plugin = plugin;
        this.shop = shop; // The specific shop data
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: this.shop.name });
        contentEl.createEl('p', { text: this.shop.description, cls: 'shop-description' });
        
        // Display coins
        const coinDisplay = contentEl.createEl('div', { cls: 'shop-coins' });
        coinDisplay.createEl('h3', { text: `Your Coins: ${this.plugin.settings.coins}` });
        
        // Get items specific to this shop's folder path
        const itemNotes = [];
        const shopFolderPath = this.shop.folderPath;
        
        // Get files with #item tag that are in this shop's category
        const itemFiles = this.app.vault.getMarkdownFiles().filter(file => {
            // Check if file has relevant tags and its path matches the shop folder
            const cache = this.app.metadataCache.getFileCache(file);
            const hasItemTag = cache && cache.tags && cache.tags.some(tag => tag.tag === '#item');
            return hasItemTag && file.path.startsWith(shopFolderPath);
        });
        
        // Add files from the shop's folder
        const shopFolder = this.app.vault.getAbstractFileByPath(shopFolderPath);
        if (shopFolder && shopFolder.children) {
            shopFolder.children.forEach(file => {
                if (file.extension === 'md' && !itemFiles.some(f => f.path === file.path)) {
                    itemFiles.push(file);
                }
            });
        }
        
        // Initialize stock for new items if needed
        itemFiles.forEach(file => {
            if (this.plugin.settings.shopStock[file.path] === undefined) {
                // Random stock between 1-10 for new items
                this.plugin.settings.shopStock[file.path] = Math.floor(Math.random() * 10) + 1;
            }
        });
        
        // Get file metadata and create shop items
        for (const file of itemFiles) {
            const metadata = this.app.metadataCache.getFileCache(file);
            const content = await this.app.vault.read(file);
            
            const item = {
                name: file.basename,
                file: file,
                price: (metadata && metadata.frontmatter && metadata.frontmatter.price) || 
                       Math.floor(Math.random() * 90) + 10,
                description: (metadata && metadata.frontmatter && metadata.frontmatter.description) || 
                            "No description available.",
                stock: this.plugin.settings.shopStock[file.path] || 0
            };
            
            itemNotes.push(item);
        }
        
        // Display shop items
        const shopContainer = contentEl.createEl('div', { cls: 'shop-container' });
        
        if (itemNotes.length === 0) {
            shopContainer.createEl('p', { text: `No items available in ${this.shop.name}.` });
        } else {
            const table = shopContainer.createEl('table');
            const headerRow = table.createEl('tr');
            headerRow.createEl('th', { text: 'Item' });
            headerRow.createEl('th', { text: 'Price' });
            headerRow.createEl('th', { text: 'Stock' });
            headerRow.createEl('th', { text: 'Description' });
            headerRow.createEl('th', { text: 'Action' });
            
            itemNotes.forEach(item => {
                const row = table.createEl('tr');
                
                const nameCell = row.createEl('td');
                const itemLink = nameCell.createEl('a', { text: item.name });
                itemLink.addEventListener('click', (event) => {
                    event.preventDefault();
                    this.app.workspace.getLeaf().openFile(item.file);
                });
                
                row.createEl('td', { text: item.price.toString() });
                row.createEl('td', { text: item.stock.toString() });
                row.createEl('td', { text: item.description });
                
                const actionCell = row.createEl('td');
                const buyButton = actionCell.createEl('button', { text: 'Buy' });
                
                // Disable buy button if out of stock
                if (item.stock <= 0) {
                    buyButton.disabled = true;
                    buyButton.addClass('button-disabled');
                }
                
                buyButton.addEventListener('click', async () => {
                    // Check if player has enough coins
                    if (this.plugin.settings.coins < item.price) {
                        new Notice("Not enough coins!");
                        return;
                    }
                    
                    // Check if item is in stock
                    if (this.plugin.settings.shopStock[item.file.path] <= 0) {
                        new Notice("Item out of stock!");
                        return;
                    }
                    
                    // Add item to inventory
                    const existingItem = this.plugin.settings.inventory.find(i => i.name === item.name);
                    if (existingItem) {
                        existingItem.quantity += 1;
                    } else {
                        this.plugin.settings.inventory.push({
                            name: item.name,
                            file: item.file.path,
                            quantity: 1,
                            price: item.price,
                            description: item.description
                        });
                    }
                    
                    // Deduct coins
                    this.plugin.settings.coins -= item.price;
                    
                    // Reduce stock
                    this.plugin.settings.shopStock[item.file.path] -= 1;
                    
                    await this.plugin.saveSettings();
                    
                    new Notice(`Purchased ${item.name}!`);
                    this.onOpen(); // Refresh the modal
                });
            });
        }
        
        // Navigation buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'shop-buttons' });
        
        // Back to shop selection
        const backButton = buttonContainer.createEl('button', { text: 'Back to Shops' });
        backButton.addEventListener('click', () => {
            this.close();
            new ShopSelectionModal(this.app, this.plugin).open();
        });
        
        // Open inventory
        const inventoryButton = buttonContainer.createEl('button', { text: 'Open Inventory', cls: 'mod-cta' });
        inventoryButton.addEventListener('click', () => {
            this.close();
            new InventoryModal(this.app, this.plugin).open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class RPGInventorySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'RPG Inventory Settings' });
        containerEl.createEl('h3', { text: 'Item Folders' });

        // Shop management section
        containerEl.createEl('h3', { text: 'Shop Management' });
        
        // Display current folders with delete buttons
        const folderList = containerEl.createEl('div', { cls: 'rpg-inventory-folder-list' });
        
        this.plugin.settings.itemFolderPaths.forEach((path, index) => {
            const folderDiv = folderList.createEl('div', { cls: 'rpg-inventory-folder-item' });
            folderDiv.createEl('span', { text: path });
            
            const deleteButton = folderDiv.createEl('button', { text: 'Remove' });
            deleteButton.addEventListener('click', async () => {
                this.plugin.settings.itemFolderPaths.splice(index, 1);
                await this.plugin.saveSettings();
                this.display(); // Refresh settings panel
            });
        });
        
        // Add new folder option
        const newFolderDiv = containerEl.createEl('div', { cls: 'rpg-inventory-new-folder' });
        
        const newFolderInput = newFolderDiv.createEl('input', {
            type: 'text',
            placeholder: 'New folder path (e.g., Potions/)'
        });
        
        const addButton = newFolderDiv.createEl('button', { text: 'Add Folder' });
        addButton.addEventListener('click', async () => {
            const newPath = newFolderInput.value.trim();
            if (newPath) {
                this.plugin.settings.itemFolderPaths.push(newPath);
                await this.plugin.saveSettings();
                newFolderInput.value = '';
                this.display(); // Refresh settings panel
            }
        });

        // List existing shops
        const shopList = containerEl.createEl('div', { cls: 'rpg-inventory-shop-list' });

        this.plugin.settings.shops.forEach((shop, index) => {
            const shopDiv = shopList.createEl('div', { cls: 'rpg-inventory-shop-item' });
            
            const shopInfo = shopDiv.createEl('div', { cls: 'rpg-inventory-shop-info' });
            shopInfo.createEl('span', { text: shop.name, cls: 'shop-name' });
            shopInfo.createEl('span', { text: shop.folderPath, cls: 'shop-path' });
            
            const deleteButton = shopDiv.createEl('button', { text: 'Remove' });
            deleteButton.addEventListener('click', async () => {
                this.plugin.settings.shops.splice(index, 1);
                await this.plugin.saveSettings();
                this.display(); // Refresh settings panel
            });
        });

        // Add new shop
        const newShopDiv = containerEl.createEl('div', { cls: 'rpg-inventory-new-shop' });

        const nameInput = newShopDiv.createEl('input', {
            type: 'text',
            placeholder: 'Shop Name'
        });
        
        const pathInput = newShopDiv.createEl('input', {
            type: 'text',
            placeholder: 'Folder Path (e.g., Gems/)'
        });
        
        const descInput = newShopDiv.createEl('input', {
            type: 'text',
            placeholder: 'Shop Description'
        });
        
        const addShopButton = newShopDiv.createEl('button', { text: 'Add Shop' });
        addShopButton.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const path = pathInput.value.trim();
            const desc = descInput.value.trim();
            
            if (name && path) {
                this.plugin.settings.shops.push({
                    name: name,
                    folderPath: path,
                    description: desc || `Shop for ${name} items`
                });
                
                await this.plugin.saveSettings();
                nameInput.value = '';
                pathInput.value = '';
                descInput.value = '';
                this.display(); // Refresh settings panel
            }
        });

        new Setting(containerEl)
            .setName('Items Folder Path')
            .setDesc('Folder path where your item notes are stored (e.g., "Items/" or "RPG/Items/")')
            .addText(text => text
                .setPlaceholder('Items/')
                .setValue(this.plugin.settings.itemFolderPath)
                .onChange(async (value) => {
                    this.plugin.settings.itemFolderPath = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('Reset Coins')
            .setDesc('Reset your coin balance')
            .addButton(button => button
                .setButtonText('Reset to 1000 coins')
                .onClick(async () => {
                    this.plugin.settings.coins = 1000;
                    await this.plugin.saveSettings();
                    new Notice('Coins reset to 1000!');
                }));
        
        new Setting(containerEl)
            .setName('Clear Inventory')
            .setDesc('Remove all items from your inventory')
            .addButton(button => button
                .setButtonText('Clear Inventory')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.inventory = [];
                    await this.plugin.saveSettings();
                    new Notice('Inventory cleared!');
                }));
                
        // Stock refresh button
        new Setting(containerEl)
        .setName('Refresh Shop Stock')
        .setDesc('Randomly restock all shop items')
        .addButton(button => button
            .setButtonText('Restock Shops')
            .onClick(async () => {
                // Get all item files
                const itemFiles = this.app.vault.getMarkdownFiles().filter(file => {
                    // Check if file is in any shop folder
                    return this.plugin.settings.shops.some(shop => 
                        file.path.startsWith(shop.folderPath));
                });
                
                // Restock each item (1-10 quantity)
                itemFiles.forEach(file => {
                    this.plugin.settings.shopStock[file.path] = Math.floor(Math.random() * 10) + 1;
                });
                
                await this.plugin.saveSettings();
                new Notice('Shops have been restocked!');
            }));
    }
}

// Default settings
const DEFAULT_SETTINGS = {
    coins: 1000,
    inventory: [],
    itemFolderPaths: ['Items/', 'Weapons/', 'Armor/'], // Default folders - replace with your preferred ones
    shops: [
        {
            name: "General Store",
            folderPath: "Items/",
            description: "Basic supplies and miscellaneous goods"
        },
        {
            name: "Blacksmith",
            folderPath: "Weapons/",
            description: "Quality weapons and armor"
        },
        {
            name: "Alchemist",
            folderPath: "Potions/",
            description: "Magical potions and herbs"
        }
    ],
    shopStock: {} // Will store item path -> stock count
};

class ShopSelectionModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Available Shops' });
        
        // Display coins
        const coinDisplay = contentEl.createEl('div', { cls: 'shop-coins' });
        coinDisplay.createEl('h3', { text: `Your Coins: ${this.plugin.settings.coins}` });
        
        // Create shop list
        const shopList = contentEl.createEl('div', { cls: 'shop-selection-list' });
        
        this.plugin.settings.shops.forEach(shop => {
            const shopCard = shopList.createEl('div', { cls: 'shop-card' });
            shopCard.createEl('h3', { text: shop.name });
            shopCard.createEl('p', { text: shop.description });
            
            const enterButton = shopCard.createEl('button', { text: 'Enter Shop', cls: 'mod-cta' });
            enterButton.addEventListener('click', () => {
                this.close();
                new ShopModal(this.app, this.plugin, shop).open();
            });
        });
        
        // Add inventory button
        const inventoryButton = contentEl.createEl('button', { text: 'Open Inventory', cls: 'inventory-button' });
        inventoryButton.addEventListener('click', () => {
            this.close();
            new InventoryModal(this.app, this.plugin).open();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

module.exports = RPGInventoryPlugin;