import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

function App() {
    const [data, setData] = useState(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        setData(null);
        invoke('getHistory', { page }).then(setData)
    }, [page]);

    const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1;

    return (
        <div>
            <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}>Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!data || page >= totalPages}>Next</button>
            <button onClick={() => setPage(totalPages)} disabled={!data}>Last</button>
            {data ? (
                <table>
                    <thead>
                    <tr>
                        <th>Date</th>
                        <th>Product</th>
                        <th>Task</th>
                        <th>Transition</th>
                    </tr>
                    </thead>
                    <tbody>
                    {data.rows.map((row) => (
                        <tr key={row.id}>
                        <td>{row.changed_at}</td>
                        <td>{row.product_name}</td>
                        <td>{row.task_name}</td>
                        <td>{row.from_status ?? '—'} → {row.to_status}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                ) : (
                'Loading...'
            )}
        </div>
    );
}

export default App;
