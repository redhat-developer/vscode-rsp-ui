import { AdaptersConstants } from './common/adaptersContants';
import { expect } from 'chai';
import { ActivityBar, SideBarView, ViewControl, ExtensionsViewSection, By, TitleActionButton } from 'vscode-extension-tester';

/**
 * @author Ondrej Dockal <odockal@redhat.com>
 */
export function extensionUIAssetsTest(): void {
    describe('Verify extension\'s base assets are available after installation', () => {

        let view: ViewControl;
        let sideBar: SideBarView;
        let section: ExtensionsViewSection;

        beforeEach(async function() {
            this.timeout(10000);
            view = await new ActivityBar().getViewControl('Extensions');
            sideBar = await view.openView();
            const content = sideBar.getContent();
            section = await content.getSection('Installed') as ExtensionsViewSection;
        });

        it('Runtime Server Protocol UI extension is installed', async function() {
            this.timeout(10000);
            const items = await section.getVisibleItems();
            expect(await Promise.all(items.map(item => item.getTitle()))).to.include(AdaptersConstants.RSP_UI_NAME);
        });

        it('Action button "Create New Server..." from Servers tab is available', async function() {
            this.timeout(10000);
            const explorerView = await new ActivityBar().getViewControl('Explorer');
            const bar = await explorerView.openView();
            const content = bar.getContent();
            const explorerSection = await content.getSection(AdaptersConstants.RSP_SERVERS_LABEL);
            const actionButton = await explorerSection.getAction(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
            expect(await actionButton.getLabel()).to.equal(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
        });

        it('Servers tab is available under Explorer bar', async function() {
            this.timeout(10000);
            const explorerView = await new ActivityBar().getViewControl('Explorer');
            expect(explorerView).not.undefined;
            const bar = await explorerView.openView();
            const content = bar.getContent();
            const sections = await content.getSections();
            expect(await Promise.all(sections.map(item => item.getTitle()))).to.include(AdaptersConstants.RSP_SERVERS_LABEL);
            const explorerSection = await content.getSection(AdaptersConstants.RSP_SERVERS_LABEL);
            expect(explorerSection).not.undefined;
            expect(await explorerSection.getTitle()).to.equal(AdaptersConstants.RSP_SERVERS_LABEL);
            const actionsButton = await explorerSection.getActions();
            expect(actionsButton.length).to.equal(1);
            expect(await actionsButton[0].getLabel()).to.equal(AdaptersConstants.RSP_SERVER_ACTION_BUTTON);
        });

        afterEach(async function() {
            this.timeout(10000);
            try {
                if (sideBar && await sideBar.isDisplayed()) {
                    sideBar = await (await new ActivityBar().getViewControl('Extensions')).openView();
                    const titlePart = sideBar.getTitlePart();
                    const actionButton = new TitleActionButton(By.xpath('.//a[@aria-label="Clear Extensions Search Results"]'), titlePart);
                    if (await actionButton.isEnabled()) {
                        await actionButton.click();
                    }
                }
            } catch {
                // Button may not exist if no search was performed
            }
        });

        after(async () => {
            if (sideBar && await sideBar.isDisplayed() && view) {
                await view.closeView();
            }
        });
    });
}
