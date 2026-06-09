import { onMounted } from 'vue';
import type { TablePaginationConfig } from 'ant-design-vue';
import type { ListResult } from '@/types';
import { normalizeListResponse } from '@/utils/listResponse';
import { useTable } from './useTable';

interface UseResourceTableOptions<T, TSearch extends object> {
    initialSearchForm: TSearch;
    fetcher: (query: TSearch) => Promise<ListResult<T>>;
    resetSearchForm: (searchForm: TSearch) => void;
    defaultPageSize?: number;
    immediate?: boolean;
}

export function useResourceTable<T, TSearch extends object>(
    options: UseResourceTableOptions<T, TSearch>,
) {
    const {
        initialSearchForm,
        fetcher,
        resetSearchForm,
        defaultPageSize = 10,
        immediate = true,
    } = options;

    const { loading, data, pagination, searchForm, setPage, clearData } = useTable<T, TSearch>(
        defaultPageSize,
        initialSearchForm,
    );

    async function loadData(): Promise<void> {
        loading.value = true;
        try {
            const query = {
                ...searchForm,
                page: pagination.current,
                pageSize: pagination.pageSize,
            } as TSearch;
            const result = normalizeListResponse(await fetcher(query));
            data.value = result.list;
            pagination.total = result.total;
        } finally {
            loading.value = false;
        }
    }

    function handleSearch(): void {
        pagination.current = 1;
        clearData();
        void loadData();
    }

    function handleReset(): void {
        resetSearchForm(searchForm as TSearch);
        pagination.current = 1;
        pagination.pageSize = defaultPageSize;
        clearData();
        void loadData();
    }

    function handleTableChange(pag: TablePaginationConfig): void {
        setPage(pag.current ?? 1, pag.pageSize ?? pagination.pageSize);
        void loadData();
    }

    if (immediate) {
        onMounted(() => {
            void loadData();
        });
    }

    return {
        loading,
        data,
        pagination,
        searchForm,
        loadData,
        handleSearch,
        handleReset,
        handleTableChange,
        clearData,
    };
}
