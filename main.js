// main.js

const { Plugin, Notice, PluginSettingTab, Setting, Modal, MarkdownView } = require('obsidian');

class RPGInventoryPlugin extends Plugin {
    async onload() {
        console.log('Loading RPG Inventory plugin');

        // Load settings
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    
        // Check for auto-restock
        await this.checkAndAutoRestock();

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

        //rpg treasury loot
        this.registerMarkdownCodeBlockProcessor('rpg-loot', (source, el, ctx) => {
            // Parse the source to get options
            const lines = source.trim().split('\n');
            let lootPath = '';
            let buttonText = 'Find Loot!';
            let minItems = 1;
            let maxItems = 3;
            let chancePercent = 70; // 70% chance to find items by default
        
            // Parse options from the codeblock
            lines.forEach(line => {
                if (line.startsWith('path:')) {
                    lootPath = line.substring(5).trim();
                } else if (line.startsWith('text:')) {
                    buttonText = line.substring(5).trim();
                } else if (line.startsWith('min:')) {
                    minItems = parseInt(line.substring(4).trim()) || 1;
                } else if (line.startsWith('max:')) {
                    maxItems = parseInt(line.substring(4).trim()) || 3;
                } else if (line.startsWith('chance:')) {
                    chancePercent = parseInt(line.substring(7).trim()) || 70;
                }
            });
        
            // Create a title for the loot section
            el.createEl('h3', { text: 'Loot Opportunity' });
        
            // Create the loot button
            const lootButton = el.createEl('button', { 
                text: buttonText,
                cls: 'rpg-loot-button mod-cta'
            });
        
            // Add event listener to the loot button
            lootButton.addEventListener('click', async () => {
                // First, check if there's a chance of finding nothing
                const rollChance = Math.random() * 100;
                if (rollChance > chancePercent) {
                    new Notice("You found nothing this time!");
                    return;
                }
        
                // Get all potential loot items from the specified folder
                const lootFiles = this.app.vault.getMarkdownFiles().filter(file => {
                    // If no specific path is given, use any folder with items
                    if (!lootPath) {
                        return this.settings.itemFolderPaths.some(path => 
                            file.path.startsWith(path));
                    }
                    // Otherwise use the specified path
                    return file.path.startsWith(lootPath);
                });
        
                if (lootFiles.length === 0) {
                    new Notice(`No loot items found in ${lootPath || 'any item folders'}!`);
                    return;
                }
        
                // Determine how many items to give
                const numItems = Math.floor(Math.random() * (maxItems - minItems + 1)) + minItems;
                
                // Select random items (may include duplicates)
                const foundItems = [];
                for (let i = 0; i < numItems; i++) {
                    const randomIndex = Math.floor(Math.random() * lootFiles.length);
                    const lootFile = lootFiles[randomIndex];
                    
                    try {
                        // Get file metadata for item properties
                        const metadata = this.app.metadataCache.getFileCache(lootFile);
                        const content = await this.app.vault.read(lootFile);
                        
                        // Try to parse properties from file
                        const priceMatch = content.match(/\((\d+)\s+#price\)/);
                        const descMatch = content.match(/\(([^)]+)\s+#description\)/);
                        const consumableMatch = content.match(/(\d+)\/(\d+)\s+#consumable/);
                        const isConsumable = content.includes("#consumable");
                        
                        // Create the item object
                        const item = {
                            name: lootFile.basename,
                            file: lootFile.path,
                            quantity: 1,
                            price: (metadata?.frontmatter?.price) || 
                                   (priceMatch ? parseInt(priceMatch[1]) : Math.floor(Math.random() * 50) + 5),
                            description: (metadata?.frontmatter?.description) || 
                                        (descMatch ? descMatch[1] : "Looted item"),
                            isConsumable: isConsumable,
                            currentUses: consumableMatch ? parseInt(consumableMatch[1]) : 1,
                            maxUses: consumableMatch ? parseInt(consumableMatch[2]) : 1
                        };
                        
                        foundItems.push(item);
                    } catch (error) {
                        console.error("Error parsing loot item:", error);
                    }
                }
                
                // Add items to inventory
                if (foundItems.length > 0) {
                    foundItems.forEach(newItem => {
                        // Check if item already exists in inventory
                        const existingItem = this.settings.inventory.find(i => i.name === newItem.name);
                        if (existingItem) {
                            existingItem.quantity += 1;
                        } else {
                            this.settings.inventory.push(newItem);
                        }
                    });
                    
                    // Save settings
                    await this.saveSettings();
                    
                    // Create notification message
                    const itemNames = foundItems.map(item => item.name).join(", ");
                    new Notice(`You found: ${itemNames}!`);
                } else {
                    new Notice("You found nothing valuable.");
                }
            });
        
            // Add a small description
            el.createEl('p', { 
                text: `Chance to find ${minItems}-${maxItems} random items from ${lootPath || 'any item folder'}.`,
                cls: 'rpg-loot-description'
            });
        });
    }

    onunload() {
        console.log('Unloading RPG Inventory plugin');
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
    async checkAndAutoRestock() {
        const currentTime = Date.now();
        const daysSinceRestock = Math.floor((currentTime - this.settings.lastRestockDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceRestock >= this.settings.restockDays) {
            await this.restockShops();
            new Notice(`Shops automatically restocked after ${daysSinceRestock} days!`);
        }
    }
    async restockShops() {
        // Get all item files
        const itemFiles = this.app.vault.getMarkdownFiles().filter(file => {
            // Check if file is in any shop folder
            return this.settings.shops.some(shop => 
                file.path.startsWith(shop.folderPath));
        });
        
        // For each item, get its base price from metadata or content
        for (const file of itemFiles) {
            // Restock quantity (1-10)
            this.settings.shopStock[file.path] = Math.floor(Math.random() * 10) + 1;
            
            // Apply price variation if item exists in inventory or has a known base price
            if (this.settings.itemBasePrice === undefined) {
                this.settings.itemBasePrice = {};
            }
            
            // Try to get existing base price or determine from file
            if (!this.settings.itemBasePrice[file.path]) {
                // Get the base price from metadata if possible
                try {
                    const metadata = this.app.metadataCache.getFileCache(file);
                    const content = await this.app.vault.read(file);
                    
                    // Check for price in frontmatter
                    let basePrice = metadata?.frontmatter?.price;
                    
                    // If not in frontmatter, check for inline price tag
                    if (!basePrice) {
                        const priceMatch = content.match(/\((\d+)\s+#price\)/);
                        if (priceMatch) {
                            basePrice = parseInt(priceMatch[1]);
                        }
                    }
                    
                    // If still no price, generate a random base price
                    if (!basePrice) {
                        basePrice = Math.floor(Math.random() * 90) + 10;
                    }
                    
                    this.settings.itemBasePrice[file.path] = basePrice;
                } catch (error) {
                    console.error("Error getting base price:", error);
                    this.settings.itemBasePrice[file.path] = Math.floor(Math.random() * 90) + 10;
                }
            }
        
            // Now apply price variation
            const basePrice = this.settings.itemBasePrice[file.path];
            const variation = this.settings.priceVariation; // 0.3 = 30%
            
            // Random variation between -30% to +30%
            const variationFactor = 1 + (Math.random() * variation * 2 - variation);
            
            // Store the current price
            if (this.settings.itemCurrentPrice === undefined) {
                this.settings.itemCurrentPrice = {};
            }
            
            // Calculate new price and round to integer
            this.settings.itemCurrentPrice[file.path] = Math.round(basePrice * variationFactor);
        }
        
        // Update last restock date
        this.settings.lastRestockDate = Date.now();
        
        await this.saveSettings();
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
                
                // For consumable items, show remaining uses
                const nameCell = row.createEl('td');
                if (item.isConsumable) {
                    const itemLink = nameCell.createEl('a', { 
                        text: `${item.name} (${item.currentUses}/${item.maxUses} uses)` 
                    });
                    itemLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        const file = this.app.vault.getAbstractFileByPath(item.file);
                        if (file) this.app.workspace.getLeaf().openFile(file);
                    });
                } else {
                    const itemLink = nameCell.createEl('a', { text: item.name });
                    itemLink.addEventListener('click', (event) => {
                        event.preventDefault();
                        const file = this.app.vault.getAbstractFileByPath(item.file);
                        if (file) this.app.workspace.getLeaf().openFile(file);
                    });
                }
                
                row.createEl('td', { text: item.quantity.toString() });
                
                const actionCell = row.createEl('td');
                const useButton = actionCell.createEl('button', { text: 'Use' });
                useButton.addEventListener('click', async () => {
                    if (item.isConsumable) {
                        // Decrease uses for consumable items
                        item.currentUses -= 1;
                        
                        // If no uses left, remove one from quantity or remove item
                        if (item.currentUses <= 0) {
                            if (item.quantity > 1) {
                                item.quantity -= 1;
                                // Reset uses for the next item
                                item.currentUses = item.maxUses;
                            } else {
                                // Remove item from inventory if last one
                                const index = this.plugin.settings.inventory.indexOf(item);
                                this.plugin.settings.inventory.splice(index, 1);
                            }
                            new Notice(`Used last charge of ${item.name}!`);
                        } else {
                            new Notice(`Used ${item.name}! ${item.currentUses}/${item.maxUses} uses remaining.`);
                        }
                        
                        await this.plugin.saveSettings();
                        this.onOpen(); // Refresh the modal
                    } else {
                        new Notice(`Used ${item.name}!`);
                    }
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
    
    async parseItemContent(content) {
        const priceMatch = content.match(/\((\d+)\s+#price\)/);
        const descMatch = content.match(/\(([^)]+)\s+#description\)/);
        
        return {
            price: priceMatch ? parseInt(priceMatch[1]) : null,
            description: descMatch ? descMatch[1] : null
        };
    }

    async parseItemTags(content) {
        // Check for consumable tag with usage count (e.g., "3/3 #consumable")
        const consumableMatch = content.match(/(\d+)\/(\d+)\s+#consumable/);
        const isConsumable = content.includes("#consumable");
        
        return {
            isConsumable: isConsumable,
            currentUses: consumableMatch ? parseInt(consumableMatch[1]) : 1,
            maxUses: consumableMatch ? parseInt(consumableMatch[2]) : 1
        };
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
            
            // Extract price and description from content
            const parsedContent = await this.parseItemContent(content);
            const parsedTags = await this.parseItemTags(content);
    
            const item = {
                name: file.basename,
                file: file,
                // Check frontmatter first, then parsed content, then random price
                price: this.plugin.settings.itemCurrentPrice?.[file.path] ||
                (metadata && metadata.frontmatter && metadata.frontmatter.price) || 
                parsedContent?.price ||
                Math.floor(Math.random() * 90) + 10,
                description: (metadata && metadata.frontmatter && metadata.frontmatter.description) || 
                 parsedContent?.description ||
                 "No description available.",
                stock: this.plugin.settings.shopStock[file.path] || 0,
                isConsumable: parsedTags.isConsumable,
                currentUses: parsedTags.currentUses,
                maxUses: parsedTags.maxUses
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
                            description: item.description,
                            isConsumable: item.isConsumable,
                            currentUses: item.currentUses,
                            maxUses: item.maxUses
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
                await this.plugin.restockShops();
                new Notice('Shops have been restocked with price variation!');
            }));

        new Setting(containerEl)
            .setName('Auto-Restock Days')
            .setDesc('Number of days between automatic shop restocks')
            .addSlider(slider => slider
                .setLimits(1, 14, 1)
                .setValue(this.plugin.settings.restockDays)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.restockDays = value;
                    await this.plugin.saveSettings();
                }))
            .addExtraButton(button => button
                .setIcon('reset')
                .setTooltip('Reset to 3 days')
                .onClick(async () => {
                    this.plugin.settings.restockDays = 3;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        new Setting(containerEl)
                .setName('Price Variation')
                .setDesc('Price variation percentage during restocks (0.3 = ±30%)')
                .addSlider(slider => slider
                    .setLimits(0, 1, 0.05)
                    .setValue(this.plugin.settings.priceVariation)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.priceVariation = value;
                        await this.plugin.saveSettings();
                    }))
                .addExtraButton(button => button
                    .setIcon('reset')
                    .setTooltip('Reset to 30%')
                    .onClick(async () => {
                        this.plugin.settings.priceVariation = 0.3;
                        await this.plugin.saveSettings();
                        this.display();
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
    shopStock: {}, // Will store item path -> stock count
    lastRestockDate: Date.now(),
    restockDays: 3, // Restock every 3 days by default
    priceVariation: 0.3, // 30% price variation
    itemCurrentPrice: {}, // Will store item path -> current price
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