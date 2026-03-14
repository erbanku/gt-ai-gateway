import { defineStore } from 'pinia';
import { ref } from 'vue';
import { status } from '@/api/system';

export const useAppStore = defineStore('app', () => {
    const sidebarCollapsed = ref(false);
    const version = ref('');

    function toggleSidebar() {
        sidebarCollapsed.value = !sidebarCollapsed.value;
    }

    async function fetchVersion() {
        try {
            const data = await status();
            version.value = data.system?.version || '';
        } catch (error) {
            console.error('Failed to fetch version:', error);
        }
    }

    return {
        sidebarCollapsed,
        version,
        toggleSidebar,
        fetchVersion,
    };
});
