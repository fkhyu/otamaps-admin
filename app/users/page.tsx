'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClientComponentClient();

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    // Fetch users
    useEffect(() => {
        async function fetchUsers() {
            const { data, error } = await supabase
                .from('users')
                .select('*')

            if (error) {
                console.error('Error:', error)
                setError(error instanceof Error ? error.message : 'An unexpected error occurred');
            }
        }
    })
}