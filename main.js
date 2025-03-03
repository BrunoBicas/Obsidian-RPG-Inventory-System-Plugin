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
                new ShopModal(this.app, this).open();
            }
        });

        // Add ribbon icon
        this.addRibbonIcon('backpack', 'RPG Inventory', () => {
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
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ShopModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: 'Shop' });
        
        // Display coins
        const coinDisplay = contentEl.createEl('div', { cls: 'shop-coins' });
        coinDisplay.createEl('h3', { text: `Your Coins: ${this.plugin.settings.coins}` });
        
        // Get items from notes with the #item tag or from the Items folder
        const itemNotes = [];
        
        // Get files with #item tag
        const itemFiles = this.app.vault.getMarkdownFiles().filter(file => {
            // Check if file has #item tag
            const cache = this.app.metadataCache.getFileCache(file);
            return cache && cache.tags && cache.tags.some(tag => tag.tag === '#item');
        });
        
        // Add files from the Items folder if it exists
        const itemsFolder = this.app.vault.getAbstractFileByPath(this.plugin.settings.itemFolderPath);
        if (itemsFolder && itemsFolder.children) {
            itemsFolder.children.forEach(file => {
                if (file.extension === 'md' && !itemFiles.includes(file)) {
                    itemFiles.push(file);
                }
            });
        }
        
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
                            "No description available."
            };
            
            itemNotes.push(item);
        }
        
        // Display shop items
        const shopContainer = contentEl.createEl('div', { cls: 'shop-container' });
        
        if (itemNotes.length === 0) {
            shopContainer.createEl('p', { text: 'No items available. Add notes with the #item tag or in the Items folder.' });
        } else {
            const table = shopContainer.createEl('table');
            const headerRow = table.createEl('tr');
            headerRow.createEl('th', { text: 'Item' });
            headerRow.createEl('th', { text: 'Price' });
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
                row.createEl('td', { text: item.description });
                
                const actionCell = row.createEl('td');
                const buyButton = actionCell.createEl('button', { text: 'Buy' });
                
                buyButton.addEventListener('click', async () => {
                    // Check if player has enough coins
                    if (this.plugin.settings.coins < item.price) {
                        new Notice("Not enough coins!");
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
                    await this.plugin.saveSettings();
                    
                    new Notice(`Purchased ${item.name}!`);
                    this.onOpen(); // Refresh the modal
                });
            });
        }
        
        // Add inventory button
        const inventoryButton = contentEl.createEl('button', { text: 'Open Inventory', cls: 'mod-cta' });
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
    }
}

// Default settings
const DEFAULT_SETTINGS = {
    coins: 1000,
    inventory: [],
    itemFolderPath: 'Items/'
};

module.exports = RPGInventoryPlugin;
