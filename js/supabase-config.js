// ===============================================
// supabase-config.js (V6 - Fixed RLS Recursion)
// ===============================================

console.log("📁 Supabase Config Loaded from: app/js/supabase-config.js");

// ในฟังก์ชัน ensureUserDocumentExists, เปลี่ยน log message หากต้องการ
const log = (msg, type) => {
    console.log(`[Supabase Config] ${msg}`);
};

// 1. Supabase Project Configuration
const SUPABASE_URL = 'https://oibubvhuiuurkxhnefsw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tDw0VvUdJsLrETh25IKCRA_VG-telwP';

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// 2. Global Supabase Clients
let supabaseClient = null;
let supabaseAdmin = null;

// 3. ฟังก์ชันสำหรับ initialize Supabase Client
function initializeSupabaseClient() {
    if (typeof supabase !== 'undefined') {
        // Client สำหรับผู้ใช้ทั่วไป
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        
        // Client สำหรับ Admin Operations (ใช้สำหรับ server-side เท่านั้น)
        // ⚠️ ไม่แนะนำให้ใช้ใน frontend จริง
        // supabaseAdmin = supabase.createClient(SUPABASE_URL, 'YOUR_SERVICE_ROLE_KEY');
        
        console.log("✅ Supabase Client Initialized.");
        return supabaseClient;
    } else {
        console.error("❌ Supabase library not loaded. Make sure CDN is loaded first.");
        return null;
    }
}

// 4. เรียก initialize เมื่อ DOM พร้อม
document.addEventListener('DOMContentLoaded', function() {
    // ตรวจสอบว่ามี supabase library อยู่แล้วหรือยัง
    if (typeof supabase !== 'undefined') {
        initializeSupabaseClient();
        setupAuthStateListener();
    } else {
        // รอให้ CDN โหลดเสร็จ
        const checkSupabase = setInterval(function() {
            if (typeof supabase !== 'undefined') {
                initializeSupabaseClient();
                setupAuthStateListener();
                clearInterval(checkSupabase);
            }
        }, 100);
    }
});

// 5. ฟังก์ชันสำหรับตรวจสอบสถานะ Authentication
function setupAuthStateListener() {
    if (!supabaseClient) return;
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log(`Auth state changed: ${event}`);
        if (event === 'SIGNED_IN' && session?.user) {
            console.log('User signed in:', session.user.email);
            // ตรวจสอบว่ามี user document หรือไม่
            ensureUserDocumentExists(session.user, console);
        }
    });
}

// 6. ฟังก์ชันสำหรับเพิ่มข้อมูลผู้ใช้ (Users Table) - แก้ไขใหม่
// 6. ฟังก์ชันสำหรับเพิ่มข้อมูลผู้ใช้ - แก้ไขให้ใช้ RPC function โดยตรง
async function ensureUserDocumentExists(user, logHandler = console) {
    if (!supabaseClient) {
        const msg = '❌ Supabase Client not initialized.';
        logHandler.add ? logHandler.add(msg, 'error') : console.error(msg);
        return false;
    }

    const user_uid = user.id;
    const userEmail = user.email;

    try {
        console.log(`🔄 กำลังสร้าง/ตรวจสอบผู้ใช้: ${userEmail}`);

        // ใช้ RPC function create_user_safe ที่มีอยู่แล้ว (returns boolean)
        const { data: result, error } = await supabaseClient.rpc('create_user_safe', {
            p_uid: user_uid,
            p_email: userEmail,
            p_role: user.user_metadata?.role || 'student'
        });
        
        if (error) {
            console.error('❌ RPC function error:', error);
            
            // ลองใช้ create_user_if_not_exists เป็น fallback (returns JSONB)
            const { data: jsonResult, error: jsonError } = await supabaseClient.rpc('create_user_if_not_exists', {
                p_uid: user_uid,
                p_email: userEmail,
                p_role: user.user_metadata?.role || 'student'
            });
            
            if (jsonError) {
                console.error('❌ ทั้งสอง RPC functions ล้มเหลว:', jsonError);
                return false;
            }
            
            console.log('✅ สร้างผู้ใช้สำเร็จ (fallback):', jsonResult);
            return true;
        }
        
        console.log('✅ สร้างผู้ใช้สำเร็จ (create_user_safe):', result);
        return result === true;
        
    } catch (error) {
        console.error('❌ Exception in ensureUserDocumentExists:', error);
        return false;
    }
}

// 7. ฟังก์ชันสำหรับสร้างผู้ใช้แบบปลอดภัย (สำหรับใช้ในกรณี RLS recursion)
async function createUserSafe(userId, email, role = 'student') {
    if (!supabaseClient) return false;
    
    try {
        // ลอง insert ข้อมูลพื้นฐานที่สุด
        const { error } = await supabaseClient
            .from('users')
            .insert({
                uid: userId,
                email: email,
                role: role
            });
            
        if (!error) {
            console.log('✅ createUserSafe สำเร็จ');
            return true;
        }
        
        console.error('❌ createUserSafe ล้มเหลว:', error);
        return false;
    } catch (err) {
        console.error('❌ createUserSafe exception:', err);
        return false;
    }
}

// 8. ฟังก์ชันสำหรับ Gallery System (คงไว้ตามเดิม)
const GallerySystem = {
    // ดึงข้อมูลผลงานทั้งหมด
    async getSubmissions(filters = {}) {
        if (!supabaseClient) return [];
        
        try {
            let query = supabaseClient
                .from('student_submissions')
                .select(`
                    *,
                    user:users(name, avatar_url, grade),
                    mission:missions(title, description, thumbnail_url),
                    stats:submission_stats(*)
                `)
                .eq('status', 'approved');

            // Apply filters
            if (filters.missionId && filters.missionId !== 'all') {
                query = query.eq('mission_id', filters.missionId);
            }
            
            if (filters.grade && filters.grade !== 'all') {
                query = query.eq('user.grade', filters.grade);
            }

            // Apply sorting
            if (filters.sortBy) {
                switch (filters.sortBy) {
                    case 'newest':
                        query = query.order('created_at', { ascending: false });
                        break;
                    case 'popular':
                        query = query.order('stats->total_likes', { ascending: false });
                        break;
                    case 'rating':
                        query = query.order('stats->average_score', { ascending: false });
                        break;
                }
            }

            const { data, error } = await query;
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching submissions:', error);
            return [];
        }
    },

    // โหวตผลงาน
    async vote(submissionId, voteType) {
        if (!supabaseClient) return null;
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { error: 'กรุณาล็อกอินก่อนโหวต' };

        try {
            // ตรวจสอบว่าเคยโหวตแล้วหรือยัง
            const { data: existingVote } = await supabaseClient
                .from('submission_votes')
                .select('id, vote_type')
                .eq('submission_id', submissionId)
                .eq('voter_id', user.id)
                .single();

            if (existingVote) {
                // ถ้ากดปุ่มเดิมอีกครั้ง = ยกเลิกโหวต
                if (existingVote.vote_type === voteType) {
                    const { error } = await supabaseClient
                        .from('submission_votes')
                        .delete()
                        .eq('id', existingVote.id);
                    
                    if (error) throw error;
                    return { action: 'removed', voteType };
                } else {
                    // เปลี่ยนประเภทโหวต
                    const { error } = await supabaseClient
                        .from('submission_votes')
                        .update({ vote_type: voteType })
                        .eq('id', existingVote.id);
                    
                    if (error) throw error;
                    return { action: 'changed', voteType };
                }
            } else {
                // โหวตใหม่
                const { error } = await supabaseClient
                    .from('submission_votes')
                    .insert({
                        submission_id: submissionId,
                        voter_id: user.id,
                        vote_type: voteType
                    });
                
                if (error) throw error;
                return { action: 'added', voteType };
            }
        } catch (error) {
            console.error('Error voting:', error);
            return { error: error.message };
        }
    },

    // ให้คะแนนผลงาน
    async rate(submissionId, score, comment = null) {
        if (!supabaseClient) return null;
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { error: 'กรุณาล็อกอินก่อนให้คะแนน' };

        try {
            const { error } = await supabaseClient
                .from('submission_votes')
                .upsert({
                    submission_id: submissionId,
                    voter_id: user.id,
                    vote_type: 'rating',
                    score: score,
                    comment: comment
                }, {
                    onConflict: 'submission_id,voter_id'
                });
            
            if (error) throw error;
            return { success: true, score };
        } catch (error) {
            console.error('Error rating:', error);
            return { error: error.message };
        }
    },

    // รายงานผลงาน
    async report(submissionId, reason, details = null, suggestedMissionId = null) {
        if (!supabaseClient) return null;
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return { error: 'กรุณาล็อกอินก่อนรายงาน' };

        try {
            const { error } = await supabaseClient
                .from('submission_votes')
                .insert({
                    submission_id: submissionId,
                    voter_id: user.id,
                    vote_type: 'report',
                    report_reason: reason,
                    report_details: details,
                    suggested_mission_id: suggestedMissionId
                });
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error reporting:', error);
            return { error: error.message };
        }
    },

    // ดึงข้อมูลการแจ้งเตือน
    async getNotifications(limit = 10) {
        if (!supabaseClient) return [];
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return [];

        try {
            const { data, error } = await supabaseClient
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error fetching notifications:', error);
            return [];
        }
    },

    // อัปเดตสถานะการอ่านแจ้งเตือน
    async markNotificationAsRead(notificationId) {
        if (!supabaseClient) return false;
        
        try {
            const { error } = await supabaseClient
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);
            
            return !error;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return false;
        }
    }
};

// 9. Export สำหรับใช้ในไฟล์อื่น
window.SupabaseConfig = {
    client: () => supabaseClient,
    admin: () => supabaseAdmin,
    gallery: GallerySystem,
    ensureUserDocument: ensureUserDocumentExists,
    createUserSafe: createUserSafe
};

// 10. ตั้งค่า global variables สำหรับ backward compatibility
window.supabaseClient = supabaseClient;
window.initializeSupabaseClient = initializeSupabaseClient;
window.ensureUserDocumentExists = ensureUserDocumentExists;
window.createUserSafe = createUserSafe;

console.log("✅ Supabase Config fully loaded and exported globally");
