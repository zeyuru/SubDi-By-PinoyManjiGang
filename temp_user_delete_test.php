<?php
require __DIR__ . '/villa_purita_system/villa_purita/config/database.php';
require __DIR__ . '/villa_purita_system/villa_purita/models/User.php';
try {
    $user = new User();
    $username = 'tempuser123';
    $all = $user->getAll();
    echo "COUNT:" . count(array_filter($all, fn($u) => $u['username'] === $username)) . "\n";
    try {
        $id = $user->create(['username'=>$username,'email'=>$username.'@x.com','password'=>'pass1234','first_name'=>'T','last_name'=>'U','role'=>'Homeowner','status'=>'Active']);
        echo "CREATED:" . $id . "\n";
    } catch (Exception $e) {
        echo "CREATE ERROR:" . $e->getMessage() . "\n";
    }
    $pdo = Database::getInstance()->getConnection();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? AND deleted_at IS NULL');
    $stmt->execute([$username]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $r) {
        $user->delete($r['id']);
        echo "DELETED:" . $r['id'] . "\n";
    }
    try {
        $id2 = $user->create(['username'=>$username,'email'=>$username.'@x.com','password'=>'pass1234','first_name'=>'T2','last_name'=>'U2','role'=>'Homeowner','status'=>'Active']);
        echo "RECREATED:" . $id2 . "\n";
    } catch (Exception $e) {
        echo "RECREATE ERROR:" . $e->getMessage() . "\n";
    }
} catch (Exception $e) {
    echo "FATAL:" . get_class($e) . ':' . $e->getMessage() . "\n";
}
